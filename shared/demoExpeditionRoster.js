// Synthetic demo profiles shared by the user and admin apps. These are demo-only,
// internally consistent profiles; real account data must continue to come from the API.
export const DEMO_EXPEDITION_GUIDE = {
  id: "demo-admin",
  name: "Demo Admin",
  email: "demoadmin@gmail.com",
  phone: "+91 98765 00000",
  age: 36,
  sex: "Female",
  city: "Pune, Maharashtra",
  occupation: "Mountain operations coordinator",
  experienceLevel: "Advanced · 8 years",
  trekkingCapability: "Advanced · 8 years",
  blood: "O+",
  medical: "None",
  allergies: "None",
  medications: "None",
  insurancePolicy: "Margsutra Demo Duty Cover · MDC-26017",
  emergencyBeaconId: "MS-ADM-017",
  ec1Name: "Arjun Sharma",
  ec1Rel: "Spouse",
  ec1Ph: "+91 98200 00117",
  ec2Name: "Kavita Sharma",
  ec2Rel: "Sister",
  ec2Ph: "+91 98200 00118",
  organization: "Margsutra Expedition Command & SAR",
  roleTitle: "Lead Command Dispatcher",
  role: "Expedition Guide",
};

export const DEMO_EXPEDITION_MEMBERS = [
  { id: "rajm-demo-1", name: "Rhea Kulkarni", email: "rhea.k@example.com", phone: "+91 98200 11221", age: 29, sex: "Female", city: "Mumbai, Maharashtra", occupation: "Architect", experienceLevel: "Intermediate · 4 treks", trekkingCapability: "Intermediate · 4 treks", blood: "O+", medical: "Mild asthma — carries inhaler", allergies: "Bee stings", medications: "Salbutamol inhaler", insurancePolicy: "Demo Trek Cover · DTC-26021", emergencyBeaconId: "MS-RK-021", ec1Name: "Meera Kulkarni", ec1Rel: "Mother", ec1Ph: "+91 98200 11222", ec2Name: "Nikhil Kulkarni", ec2Rel: "Brother", ec2Ph: "+91 98200 11223", status: "approved", isDemo: true },
  { id: "rajm-demo-2", name: "Aditya Rane", email: "aditya.rane@example.com", phone: "+91 99670 44112", age: 32, sex: "Male", city: "Thane, Maharashtra", occupation: "Software engineer", experienceLevel: "Advanced · 12 treks", trekkingCapability: "Advanced · 12 treks", blood: "B+", medical: "None", allergies: "None", medications: "None", insurancePolicy: "Demo Trek Cover · DTC-26022", emergencyBeaconId: "MS-AR-022", ec1Name: "Sunil Rane", ec1Rel: "Father", ec1Ph: "+91 99670 44113", ec2Name: "Pooja Rane", ec2Rel: "Spouse", ec2Ph: "+91 99670 44114", status: "approved", isDemo: true },
  { id: "rajm-demo-3", name: "Sanya Deshpande", email: "sanya.d@example.com", phone: "+91 90040 78231", age: 26, sex: "Female", city: "Pune, Maharashtra", occupation: "Physiotherapist", experienceLevel: "Beginner · 2 treks", trekkingCapability: "Beginner · 2 treks", blood: "A-", medical: "Knee brace — old sprain", allergies: "None", medications: "None", insurancePolicy: "Demo Trek Cover · DTC-26023", emergencyBeaconId: "MS-SD-023", ec1Name: "Vikram Deshpande", ec1Rel: "Brother", ec1Ph: "+91 90040 78232", ec2Name: "Asha Deshpande", ec2Rel: "Mother", ec2Ph: "+91 90040 78233", status: "approved", isDemo: true },
  { id: "rajm-demo-4", name: "Kabir Sheikh", email: "kabir.s@example.com", phone: "+91 98670 55109", age: 30, sex: "Male", city: "Navi Mumbai, Maharashtra", occupation: "Photographer", experienceLevel: "Intermediate · 6 treks", trekkingCapability: "Intermediate · 6 treks", blood: "AB+", medical: "None", allergies: "Peanuts", medications: "None", insurancePolicy: "Demo Trek Cover · DTC-26024", emergencyBeaconId: "MS-KS-024", ec1Name: "Farah Sheikh", ec1Rel: "Sister", ec1Ph: "+91 98670 55110", ec2Name: "Imran Sheikh", ec2Rel: "Father", ec2Ph: "+91 98670 55111", status: "approved", isDemo: true },
  { id: "rajm-demo-5", name: "Ira Menon", email: "ira.menon@example.com", phone: "+91 98330 21004", age: 34, sex: "Female", city: "Mumbai, Maharashtra", occupation: "Doctor · Emergency medicine", experienceLevel: "Advanced · 10 treks", trekkingCapability: "Advanced · 10 treks", blood: "O-", medical: "Carries EpiPen", allergies: "Wasps", medications: "Epinephrine auto-injector", insurancePolicy: "Demo Trek Cover · DTC-26025", emergencyBeaconId: "MS-IM-025", ec1Name: "Deepa Menon", ec1Rel: "Mother", ec1Ph: "+91 98330 21005", ec2Name: "Arun Menon", ec2Rel: "Spouse", ec2Ph: "+91 98330 21006", status: "approved", isDemo: true },
];

export const DEMO_USER_PROFILE = {
  id: "demo-user",
  name: "Demo User",
  email: "demouser@gmail.com",
  phone: "+91 90000 12345",
  age: 29,
  sex: "Male",
  city: "Mulshi, Maharashtra",
  occupation: "Product designer",
  experienceLevel: "Intermediate Trekker (Western Ghats / Sahyadri)",
  trekkingCapability: "Intermediate Trekker (Western Ghats / Sahyadri)",
  blood: "B+",
  medical: "None",
  allergies: "None",
  medications: "None",
  insurancePolicy: "Demo Trek Cover · DTC-26020",
  emergencyBeaconId: "MS-DU-020",
  ec1Name: "Meera Rao",
  ec1Rel: "Sister",
  ec1Ph: "+91 99887 76655",
  ec2Name: "Sunil Rao",
  ec2Rel: "Father",
  ec2Ph: "+91 98001 23456",
  status: "approved",
  isDemo: true,
};

export function getDemoMemberProfile(member, index = 0) {
  const identity = `${member?.email || ""} ${member?.name || member?.displayName || ""} ${member?.id || member?.userId || ""}`.toLowerCase();
  const matched = identity.includes("demouser@gmail.com") || identity.includes("demo-user")
    ? DEMO_USER_PROFILE
    : DEMO_EXPEDITION_MEMBERS.find((profile) =>
      (profile.email && identity.includes(profile.email.toLowerCase())) ||
      identity.includes(profile.name.toLowerCase()) ||
      identity.includes(profile.id.toLowerCase())
    );
  let hash = 0;
  for (const char of identity || String(index)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const source = matched || DEMO_EXPEDITION_MEMBERS[hash % DEMO_EXPEDITION_MEMBERS.length];
  return {
    ...source,
    ...member,
    sex: member?.sex || member?.gender || source.sex,
    occupation: member?.occupation || member?.roleTitle || source.occupation,
    trekkingCapability: member?.trekkingCapability || member?.experienceLevel || member?.trekExperience || member?.experience || source.trekkingCapability,
    phone: member?.phone || member?.mobile || source.phone,
    blood: member?.blood || member?.bloodGroup || source.blood,
    medical: member?.medical || source.medical || "None",
    ec1Name: member?.ec1Name || source.ec1Name || "",
    ec1Ph: member?.ec1Ph || source.ec1Ph || "",
    isDemo: true,
  };
}

export function withDemoProfileDefaults(profile, defaults) {
  const merged = { ...defaults, ...profile };
  for (const key of [
    "name", "phone", "age", "sex", "city", "occupation", "experienceLevel",
    "trekkingCapability", "blood", "medical", "allergies", "medications",
    "insurancePolicy", "emergencyBeaconId", "organization", "roleTitle",
    "ec1Name", "ec1Rel", "ec1Ph", "ec2Name", "ec2Rel", "ec2Ph",
  ]) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") merged[key] = defaults[key] ?? "";
  }
  if (defaults.email === "demouser@gmail.com" && merged.ec1Name === "Demo Emergency Contact") {
    merged.ec1Name = defaults.ec1Name;
    merged.ec1Rel = defaults.ec1Rel;
    merged.ec1Ph = defaults.ec1Ph;
  }
  if (defaults.email === "demoadmin@gmail.com" && merged.ec1Name === defaults.ec1Name && merged.ec1Rel === "Family") {
    merged.ec1Rel = defaults.ec1Rel;
  }
  return merged;
}
