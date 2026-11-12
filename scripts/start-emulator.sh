#!/bin/sh
# Starts the Firestore emulator for local development.
# firebase-tools requires JDK 21+; Homebrew's openjdk@21 is keg-only, so it is
# not on PATH by default. Point JAVA_HOME at it when present.
set -e
cd "$(dirname "$0")/.."

if [ -z "$JAVA_HOME" ]; then
  if [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
    JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  elif [ -x /usr/local/opt/openjdk@21/bin/java ]; then
    JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  elif /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
    JAVA_HOME=$(/usr/libexec/java_home -v 21)
  fi
  export JAVA_HOME
fi

# If an emulator is already listening on 8080, reuse it instead of failing
# with "port already in use" (which would take the whole dev:local stack down).
if nc -z 127.0.0.1 8080 >/dev/null 2>&1; then
  echo "🔥 Firestore emulator already running on 127.0.0.1:8080 — reusing it."
  # Stay alive so `concurrently` does not treat this as a failed process.
  while nc -z 127.0.0.1 8080 >/dev/null 2>&1; do
    sleep 5
  done
  echo "⚠️  Existing Firestore emulator stopped."
  exit 0
fi

exec npx -y firebase-tools@15 emulators:start --only firestore --project demo-margsutra
