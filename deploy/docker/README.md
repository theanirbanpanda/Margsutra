# Running Margsutra as a container

One image contains everything: the prebuilt trekker app and admin console,
the Express API, the Socket.IO tracking server, and Caddy doing HTTPS.

```
container
├── caddy      :80 :443   TLS + static files + reverse proxy
├── node       :5050      Express API          (internal)
└── node       :4000      Socket.IO tracking   (internal)
```

Only 80/443 are published. The two Node ports stay inside the container.

## What is *not* in the image

- `serviceAccountKey.json` — mounted read-only at runtime
- `JWT_SECRET` — passed as an environment variable
- Nothing else from `/etc/margsutra`

Both are required; the container refuses to start without `SITE` and
`JWT_SECRET`.

## Build

From the repository root:

```bash
# Oracle Ampere A1 is arm64 → build for that platform
docker buildx build \
  --platform linux/arm64 \
  -f deploy/docker/Dockerfile \
  -t <dockerhub-user>/margsutra:latest \
  -t <dockerhub-user>/margsutra:$(date +%Y%m%d) \
  --push .
```

For the AMD free shape (`VM.Standard.E2.1.Micro`) use `--platform linux/amd64`
instead. Building an amd64 image on an Apple Silicon Mac goes through QEMU and
takes a few minutes.

## Run

```bash
docker run -d \
  --name margsutra \
  --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e SITE=13-233-12-7.nip.io \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v /etc/margsutra:/etc/margsutra:ro \
  -v margsutra-certs:/data \
  <dockerhub-user>/margsutra:latest
```

| Option | Why |
| --- | --- |
| `SITE` | Hostname Caddy requests a certificate for. No scheme, no path |
| `JWT_SECRET` | Shared by the API and the tracking server. Generate once and **keep it** — changing it logs everyone out |
| `-v /etc/margsutra:/etc/margsutra:ro` | Supplies `serviceAccountKey.json`; read-only on purpose |
| `-v margsutra-certs:/data` | Persists Let's Encrypt certificates so restarts do not re-request them (rate limits) |
| `--restart unless-stopped` | Survives VM reboots |

Optional environment variables:

| Variable | Default |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `/etc/margsutra/serviceAccountKey.json` |
| `FIREBASE_STORAGE_BUCKET` | `coordage-416a1.firebasestorage.app` |

## Verify

```bash
docker logs -f margsutra                 # watch the certificate being issued
curl -s  http://127.0.0.1/health         # {"status":"ok","db":"firebase-connected"}
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1/auth/token   # 401 = healthy
```

Then from your own machine: `https://<SITE>/` and `https://<SITE>/admin`.

## Operations

```bash
docker restart margsutra
docker logs --tail 100 margsutra

# upgrade to a newer image
docker pull <dockerhub-user>/margsutra:latest
docker rm -f margsutra
# re-run the docker run command above (same JWT_SECRET and volumes)
```

## Notes

- The container runs as **root**, because Caddy must bind ports 80/443. If that
  matters to you, publish `8080:80` / `8443:443` and terminate TLS outside.
- `deploy/oracle/setup.sh` is the **Docker-free** path (systemd + Caddy on the
  host). Use one or the other, not both — they both want ports 80/443.
- Docker Hub's free anonymous pull limit is 100 pulls/6h per IP. A single VM
  pulling once is nowhere near it.
