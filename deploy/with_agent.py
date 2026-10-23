"""One-off adapter for the user-approved Bazargard deployment through DevOps Agent."""
import asyncio
import json
import os
from pathlib import Path
import sys

AGENT_ROOT = Path("D:/projects/devops_agent")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AGENT_ROOT))
from copilot.config import Settings
from copilot.runtime import build_runtime
from copilot.tools.base import Tool, Risk, schema
from copilot.tools.catalog import registry
from copilot.tools.executor import call_tool, execute_approved

async def main():
    if "--approved" not in sys.argv:
        raise SystemExit("Requires the user's approval for the documented hosting cost.")
    bundle = ROOT / "deploy/catalog.sqlite3.gz"
    if not bundle.is_file():
        raise SystemExit("Run python deploy/prepare_catalog.py before deployment; the catalog bundle is missing.")
    from copilot.deploy.archive import project_files
    if bundle not in project_files(ROOT):
        raise SystemExit("The catalog bundle is excluded by deployment ignore rules.")
    os.chdir(AGENT_ROOT)
    settings = Settings.from_env(str(AGENT_ROOT / ".env"))
    if settings.mock:
        raise SystemExit("Live Liara credentials are required; refusing mock deployment.")
    final_verify_timeout = settings.verify_timeout_s
    settings.verify_timeout_s = 0
    rt = build_runtime(settings)
    config = json.loads((ROOT / "liara.json").read_text(encoding="utf-8-sig"))
    app = config["app"]
    async def emit(event):
        with (ROOT / "deploy/deployment.log").open("a", encoding="utf-8") as log:
            log.write(json.dumps(event, ensure_ascii=True, default=str) + "\n")
        if event.get("type") in {"progress", "build_log", "action_start", "tool_start"}:
            print(json.dumps(event, ensure_ascii=True, default=str), flush=True)
    ctx = rt.context(session_id="codex-bazargard-deployment", lang="en").with_emit(emit)
    original_release = rt.client.create_release
    async def mounted_release(name, body):
        return await original_release(name, {**body, "disks": config["disks"]})
    rt.client.create_release = mounted_release

    async def tracked_upload(name, archive):
        size = archive.stat().st_size
        class TrackedFile:
            def __init__(self, file):
                self.file = file
                self.next_report = 5 * 1024 * 1024
            def __getattr__(self, attr):
                return getattr(self.file, attr)
            def read(self, count=-1):
                chunk = self.file.read(count)
                position = self.file.tell()
                if position >= self.next_report or not chunk:
                    print(json.dumps({"upload_bytes_sent":position,"upload_total_bytes":size,
                                      "upload_percent":round(100*position/size,1)}),flush=True)
                    self.next_report = position + 5 * 1024 * 1024
                return chunk
        import httpx
        with archive.open("rb") as raw:
            data = await rt.client._request(rt.client._api,"POST",f"/v2/projects/{name}/sources",retries=0,
                files={"file":(archive.name,TrackedFile(raw),"application/gzip")},
                timeout=httpx.Timeout(300,connect=30))
        source_id = data.get("sourceID") or data.get("sourceId") or ""
        if not source_id:
            raise RuntimeError("Liara did not return a source ID")
        await emit({"type":"progress","stage":"upload_confirmed","detail":source_id})
        return source_id
    rt.client.upload_source = tracked_upload

    async def disk_handler(ctx, app):
        await ctx.client._post(f"/v1/projects/{app}/disks", json={"name":"data", "size":1})
        return {"disk":"data", "size_gb":1}
    registry.add(Tool("bazargard_data_disk", "Create the approved app's persistent data disk",
                      schema({"app":{"type":"string"}}, ["app"]), Risk.SENSITIVE, disk_handler))

    async def approved(name, args):
        proposed = await call_tool(ctx, name, args, reason="User approved creating and deploying Bazargard on the 1 GB plan in Codex.")
        if proposed.get("error"):
            raise RuntimeError(proposed)
        if proposed.get("status") != "pending_approval":
            return proposed
        result = await execute_approved(ctx, proposed["action_id"])
        print(json.dumps({"step":name,"result":result}, ensure_ascii=True, default=str), flush=True)
        if not result.get("ok"):
            raise RuntimeError(f"{name} failed")
        return result
    try:
        apps = await rt.client.list_apps()
        if app not in [a["project_id"] for a in apps]:
            await approved("create_app", {"name":app,"platform":"docker","plan_id":"medium-g2"})
        project = await rt.client.get_app(app)
        disks = await rt.client._get(f"/v1/projects/{project['_id']}/disks")
        if not any(d["name"] == "data" for d in disks.get("disks", [])):
            await approved("bazargard_data_disk", {"app":app})
        url = f"https://{app}.liara.run"
        for key,value in {"DJANGO_DEBUG":"0", "DJANGO_ALLOWED_HOSTS":f"{app}.liara.run",
                          "DJANGO_CSRF_ORIGINS":url, "PUBLIC_BASE_URL":url,
                          "SMS_PROVIDER":"simulated", "VOICE_PROVIDER":"simulated"}.items():
            current = {e["key"]: e.get("value") for e in (project.get("envs") or [])}
            if current.get(key) != value:
                await approved("set_env", {"app":app,"key":key,"value":value})
        settings.verify_timeout_s = final_verify_timeout
        await approved("deploy", {"app":app,"path":str(ROOT),"platform":"docker","port":8000,
                                  "message":"Bazargard production deployment through DevOps Agent"})
        import httpx
        async with httpx.AsyncClient(timeout=60) as http:
            for path in ("/", "/api/meta", "/api/search?q=" + "%DA%AF%D9%88%D8%B4%DB%8C"):
                response = await http.get(url + path)
                print(json.dumps({"check":path,"status":response.status_code,
                                  "body": response.text[:600] if path.startswith('/api') else 'HTML'},ensure_ascii=True),flush=True)
                response.raise_for_status()
    finally:
        await rt.client.aclose()

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
