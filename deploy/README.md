# Deploying to Liara

Before uploading the project folder through DevOps Agent, run:

```powershell
python deploy/prepare_catalog.py
```

This validates `backend/data/catalog.sqlite3` and creates
`deploy/catalog.sqlite3.gz` (about 109 MB). The original catalog exceeds the
agent's 200 MB folder-upload limit. Docker unpacks and checks the compressed
catalog during the build. The bundle stays out of Git; `.liaraignore` explicitly
includes it in deployments. A fresh Git checkout must build or obtain the catalog
and run the preparation command before uploading.

The folder contains all 6,476 shops, 225,903 products and 331,506 offers.
Local `.env` files, CSVs and the shopper database are excluded from deployment.

The Dockerfile builds React and serves it through Django and Gunicorn. Debug is
disabled and SMS and voice remain simulated. Configure the production hostname,
CSRF origin and public URL as Liara environment variables. Optional LLM credentials
also belong in the environment, never in the source archive.

The target app and port are in `liara.json`. Mount a persistent disk named `data`
at `/data` to retain shopper records and the generated signing key. The read-only
catalog remains in the container image. DevOps Agent's current pipeline requires
the mounts to be included in the release body; its basic deploy pipeline does not
read disks from `liara.json` automatically.

The optional `deploy/with_agent.py` adapter validates bundle inclusion and supplies
those mounts through the existing DevOps Agent. Run it only with prior deployment
authorization. Preparing the bundle never deploys anything.
