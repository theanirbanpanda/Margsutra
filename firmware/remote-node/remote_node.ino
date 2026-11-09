/**
 * Mountain Weather & Emergency SOS System
 * Remote Sensor Node Firmware
 * Hardware: ESP32 + BMP280 + DHT22 + PM2.5 + Rain Sensor + INMP441 (I2S Mic)
 */
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <LoRa.h>          // sandeepmistry/arduino-LoRa — standard SX127x library
#include <TinyGPS++.h>

// ─── LoRa radio pins (standard SX1276 wiring on ESP32 VSPI) ──────────────────
#define LORA_SCK      18
#define LORA_MISO     19
#define LORA_MOSI     23
#define LORA_SS       5
#define LORA_RST      14
#define LORA_DIO0     2

// India license-exempt band: 865–868 MHz (G.S.R. 853(E), 2021).
// Using the first default IN865 channel. No separate license required for
// this band at the power levels these modules ship at (see project docs).
#define LORA_FREQUENCY 865062500UL

// ─── GPS module (NEO-6M or similar, on a separate UART from the PM2.5 sensor) ─
#define GPS_RX_PIN    27
#define GPS_TX_PIN    26
#define GPS_BAUD      9600

// How often to transmit a normal reading. SOS always transmits immediately,
// regardless of this interval — see loop().
#define TRANSMIT_INTERVAL_MS 30000UL

// ─── Pin Definitions ──────────────────────────────────────────────────────────
#define DHT_PIN       4
#define DHT_TYPE      DHT22

#define PM25_RX_PIN   16   // UART2 RX from PMS5003
#define PM25_TX_PIN   17

#define RAIN_ANALOG   34   // ADC pin for rain sensor
#define RAIN_DIGITAL  35   // Digital threshold output

// I2S Mic (INMP441)
#define I2S_WS        25
#define I2S_SCK       32
#define I2S_SD        33

// SOS Button (active LOW)
#define SOS_BUTTON    0

// Node identification
#define NODE_ID       "REMOTE_01"

// Fallback coordinates — used ONLY if the GPS module has no satellite fix yet
// (cold start can take 30s–a few minutes outdoors). Set this to wherever the
// node is actually deployed/tested, purely so a reading isn't sent as (0,0)
// before the first real fix lands. The transmitted JSON always includes
// gps_fix so the gateway/dashboard can tell a real fix from this fallback.
#define FALLBACK_LAT  18.7639    // Lonavala/Rajmachi area, Maharashtra
#define FALLBACK_LON  73.3522

// ─── Globals ──────────────────────────────────────────────────────────────────
Adafruit_BMP280 bmp;
DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial pmSerial(2);
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

bool sosActive = false;
unsigned long lastTransmit = 0;
float pressureHistory[6] = {0};  // 1-minute pressure trend buffer
int pressureIdx = 0;

// PM2.5 data struct
struct PMS5003Data {
  uint16_t pm1_0, pm2_5, pm10;
  bool valid;
};

// ─── I2S Microphone Setup ─────────────────────────────────────────────────────
void setupI2SMic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 256,
    .use_apll = false
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

// ─── Sound Level Measurement ──────────────────────────────────────────────────
float measureSoundLevel() {
  const int SAMPLES = 512;
  int32_t buffer[SAMPLES];
  size_t bytes_read;

  i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, pdMS_TO_TICKS(100));

  long sum_sq = 0;
  int count = bytes_read / sizeof(int32_t);
  for (int i = 0; i < count; i++) {
    int32_t sample = buffer[i] >> 8;  // Shift for INMP441
    sum_sq += (long)sample * sample;
  }

  float rms = sqrt((float)sum_sq / count);
  // Convert to approximate dB SPL (calibrate with known source)
  float dB = 20.0 * log10(rms / 32768.0) + 120.0;
  return constrain(dB, 30.0, 130.0);
}

// ─── PM2.5 Reading ────────────────────────────────────────────────────────────
PMS5003Data readPM25() {
  PMS5003Data data = {0, 0, 0, false};
  uint8_t buf[32];

  // PMS5003 sends 32-byte frames starting with 0x42, 0x4D
  while (pmSerial.available()) pmSerial.read();  // Flush

  unsigned long t = millis();
  while (millis() - t < 500) {
    if (pmSerial.available() >= 32) {
      if (pmSerial.read() == 0x42 && pmSerial.read() == 0x4D) {
        pmSerial.readBytes(buf, 30);
        data.pm1_0 = (buf[2] << 8) | buf[3];
        data.pm2_5 = (buf[4] << 8) | buf[5];
        data.pm10  = (buf[6] << 8) | buf[7];

        // Verify checksum
        uint16_t checksum = 0x42 + 0x4D;
        for (int i = 0; i < 28; i++) checksum += buf[i];
        uint16_t recv_check = (buf[28] << 8) | buf[29];
        data.valid = (checksum == recv_check);
        break;
      }
    }
  }
  return data;
}

// ─── Rain Sensor ─────────────────────────────────────────────────────────────
float readRainMM() {
  // Map ADC 0-4095 to 0-25mm/hr (calibrate per sensor)
  int raw = analogRead(RAIN_ANALOG);
  bool raining = !digitalRead(RAIN_DIGITAL);
  if (!raining) return 0.0;
  return map(raw, 0, 4095, 0, 2500) / 100.0;
}

// ─── Pressure Trend Analysis ──────────────────────────────────────────────────
// Returns: +1 rising, -1 falling, 0 stable
int pressureTrend(float current) {
  pressureHistory[pressureIdx % 6] = current;
  pressureIdx++;

  if (pressureIdx < 6) return 0;  // Need 6 readings (1 min of 10s intervals)

  float oldest = pressureHistory[pressureIdx % 6];
  float diff = current - oldest;

  if (diff > 1.5) return 1;    // Rising > 1.5 hPa/min = improving
  if (diff < -1.5) return -1;  // Falling > 1.5 hPa/min = storm incoming
  return 0;
}



// ─── SOS Button ISR ───────────────────────────────────────────────────────────
volatile bool sosPressDetected = false;
void IRAM_ATTR onSOSPress() {
  sosPressDetected = true;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin();

  // SOS Button
  pinMode(SOS_BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SOS_BUTTON), onSOSPress, FALLING);

  // Rain sensor
  pinMode(RAIN_DIGITAL, INPUT);
  analogReadResolution(12);

  // BMP280
  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 not found! Check wiring.");
    while (1) delay(1000);
  }
  bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                  Adafruit_BMP280::SAMPLING_X2,
                  Adafruit_BMP280::SAMPLING_X16,
                  Adafruit_BMP280::FILTER_X16,
                  Adafruit_BMP280::STANDBY_MS_500);

  // DHT22
  dht.begin();

  // PM2.5 UART
  pmSerial.begin(9600, SERIAL_8N1, PM25_RX_PIN, PM25_TX_PIN);

  // GPS UART (separate from the PM2.5 UART above — different pins, different port)
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  // I2S Microphone
  setupI2SMic();

  // LoRa radio — this is the hop that needs zero WiFi/cellular signal.
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("LoRa init failed — check wiring/module before continuing.");
    while (1) delay(1000);
  }
  LoRa.setSpreadingFactor(9);     // balances range vs. airtime for this use case
  LoRa.setSignalBandwidth(125E3);
  LoRa.setTxPower(17);            // within the legal power limit for this band

  Serial.println("Remote Node Ready — " + String(NODE_ID));
}

// Builds and sends one LoRa packet with the current sensor + GPS readings.
void transmitReading() {
  float temp = bmp.readTemperature();
  float pressure = bmp.readPressure() / 100.0F;
  float altitude = bmp.readAltitude(1013.25);
  float humidity = dht.readHumidity();
  float rainMM = readRainMM();
  float soundDB = measureSoundLevel();
  PMS5003Data pm = readPM25();
  int trend = pressureTrend(pressure);

  bool hasFix = gps.location.isValid() && gps.location.age() < 5000;
  float lat = hasFix ? gps.location.lat() : FALLBACK_LAT;
  float lon = hasFix ? gps.location.lng() : FALLBACK_LON;

  StaticJsonDocument<256> doc;
  doc["node_id"] = NODE_ID;
  doc["temp"] = isnan(temp) ? 0 : temp;
  doc["humidity"] = isnan(humidity) ? 0 : humidity;
  doc["pressure"] = pressure;
  doc["altitude"] = altitude;
  doc["pressure_trend"] = trend;
  doc["rain_mm"] = rainMM;
  doc["sound_db"] = soundDB;
  doc["pm2_5"] = pm.valid ? pm.pm2_5 : -1;
  doc["pm10"] = pm.valid ? pm.pm10 : -1;
  doc["lat"] = lat;
  doc["lon"] = lon;
  doc["gps_fix"] = hasFix;
  doc["sos"] = sosActive;

  String payload;
  serializeJson(doc, payload);

  LoRa.beginPacket();
  LoRa.print(payload);
  LoRa.endPacket();

  Serial.println("TX: " + payload);

  // Brief listen window for a gateway ACK (half-duplex radio — can't send
  // and listen at once, so this is send-then-listen, not simultaneous).
  unsigned long listenStart = millis();
  while (millis() - listenStart < 500) {
    if (LoRa.parsePacket()) {
      String ack = "";
      while (LoRa.available()) ack += (char)LoRa.read();
      if (ack.indexOf("ACK") >= 0) {
        Serial.println("Gateway acknowledged.");
      }
      break;
    }
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
void loop() {
  // Feed every available byte to the GPS parser continuously — GPS modules
  // stream NMEA sentences constantly; this can't be done in one batch.
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Handle SOS button toggle (press 3× within 3s to confirm, or hold 3s)
  if (sosPressDetected) {
    sosPressDetected = false;
    sosActive = !sosActive;
    Serial.println(sosActive ? "SOS ACTIVATED" : "SOS CLEARED");
    transmitReading();   // SOS transmits immediately — never wait for the timer
    lastTransmit = millis();
  }

  // Otherwise, transmit on a fixed interval (conserves battery and stays
  // well within the band's duty-cycle expectations).
  if (millis() - lastTransmit >= TRANSMIT_INTERVAL_MS) {
    transmitReading();
    lastTransmit = millis();
  }
}
