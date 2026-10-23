from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import path, re_path

from catalog.api import api


def spa(request, *args, **kwargs):
    """Serve the built React app for every non-API route (client-side routing)."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse("Frontend not built. Run `npm run build` in frontend/ or use the Vite dev server.", status=503)
    return FileResponse(open(index, "rb"), content_type="text/html")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    re_path(r"^(?!api/|admin/|static/).*$", spa),
]
