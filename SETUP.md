# Environment Setup

Tested on Ubuntu 24.04 (WSL2). No root/sudo access required.

## Prerequisites

| Tool | Required | How installed |
|---|---|---|
| Java 11 (Temurin) | Legacy monolith (Gradle 6.7) | Tarball to `~/.local/java` — see below |
| Node.js 20 LTS | album-service | nvm — see below |
| npm | album-service | bundled with Node.js |
| Gradle | Legacy monolith | Gradle wrapper (`./gradlew`) — auto-downloads |
| make + gcc | Native npm modules | Homebrew (`brew install make gcc`) |

> **Why Java 11, not 17?** The legacy monolith uses Gradle 6.7 and Spring Boot 2.4.0.
> Gradle 6.7 does not support Java 17 (class file major version 61). Java 11 is the correct runtime for this stack.

---

## 1. Java 11 (no sudo needed)

Download the Temurin JDK 11 tarball and extract it to `~/.local/java`:

```bash
mkdir -p ~/.local/java
curl -L -o /tmp/jdk11.tar.gz \
  "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_x64_linux_hotspot_11.0.22_7.tar.gz"
tar -xzf /tmp/jdk11.tar.gz -C ~/.local/java
rm /tmp/jdk11.tar.gz
```

Add to `~/.bashrc`:

```bash
export JAVA_HOME="$HOME/.local/java/jdk-11.0.22+7"
export PATH="$JAVA_HOME/bin:$PATH"
```

Reload and verify:

```bash
source ~/.bashrc
java -version   # should print openjdk 11.0.22
```

---

## 2. Build tools (make + gcc) via Homebrew

Homebrew is already installed at `/home/linuxbrew/.linuxbrew`. Run:

```bash
brew install make gcc
# gcc installs as gcc-15; create a generic symlink:
ln -sf /home/linuxbrew/.linuxbrew/bin/gcc-15 /home/linuxbrew/.linuxbrew/bin/gcc
ln -sf /home/linuxbrew/.linuxbrew/bin/g++-15 /home/linuxbrew/.linuxbrew/bin/g++
```

These are needed to compile native npm modules (e.g. `better-sqlite3`).

---

## 3. Node.js 20 LTS via nvm

nvm is already installed. Install and set Node 20 as the default:

```bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm alias default 20
```

> **Why Node 20, not the pre-installed Node 25?**
> `better-sqlite3` requires native compilation. No prebuilt binaries exist for Node 25;
> Node 20 LTS has official prebuilt binaries so `npm install` succeeds without a compiler.

Verify:

```bash
node --version   # v20.x.x
npm --version
```

---

## 4. Install album-service dependencies

```bash
source "$HOME/.nvm/nvm.sh" && nvm use 20
cd services/album-service
npm install
```

---

## 5. Verify everything works

```bash
# Java / Gradle
export JAVA_HOME="$HOME/.local/java/jdk-11.0.22+7"
export PATH="$JAVA_HOME/bin:$PATH"
cd legacy && ./gradlew --version   # prints Gradle 6.7, JVM 11

# Node / album-service tests
source "$HOME/.nvm/nvm.sh" && nvm use 20
cd services/album-service && npm test   # 12 tests, all pass
```

---

## Running the apps

```bash
# Terminal 1 — legacy monolith on :8080
export JAVA_HOME="$HOME/.local/java/jdk-11.0.22+7"
export PATH="$JAVA_HOME/bin:$PATH"
cd legacy && ./gradlew bootRun

# Terminal 2 — album-service on :3001
source "$HOME/.nvm/nvm.sh" && nvm use 20
cd services/album-service && npm start

# Terminal 3 — characterization tests (needs monolith running on :8080)
cd tests/characterization && ./run.sh

# Contract tests (album-service must be running on :3001)
cd services/album-service && npm test
```

---

## Known test results (verified 2026-04-24)

### Characterization tests: 13/15 pass

| Test | Status | Note |
|---|---|---|
| GET /albums/:id 404 for missing album | FAIL | Monolith returns 200 with empty body for unknown IDs — this is a **known monolith bug**, pinned intentionally |
| PUT /albums/:id updates album | FAIL | Monolith returns 405 (Method Not Allowed) — PUT is not implemented; monolith uses POST for updates |

These failures document the monolith's actual behavior. Do not "fix" the characterization tests to pass — they are intentionally pinning bugs.

### Contract tests: 12/12 pass

The album-service correctly handles all cases the monolith does not (404 on missing ID, PUT support).
