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

exec npx -y firebase-tools@15 emulators:start --only firestore --project demo-margsutra
