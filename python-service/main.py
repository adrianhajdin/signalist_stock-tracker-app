import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from routers import health, research

load_dotenv()

SERVICE_SECRET = os.getenv("SERVICE_SECRET", "")

app = FastAPI(title="Hindsight Python Service", version="0.1.0")


@app.middleware("http")
async def require_service_secret(request: Request, call_next):
    # /health is public
    if request.url.path == "/health":
        return await call_next(request)

    token = request.headers.get("X-Service-Secret", "")
    if not SERVICE_SECRET or token != SERVICE_SECRET:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    return await call_next(request)


app.include_router(health.router)
app.include_router(research.router, prefix="/research")
