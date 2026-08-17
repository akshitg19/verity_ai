# One image, one service, one URL.
#
# The frontend is built here and served by the same FastAPI process that
# serves the API, so there is a single deploy, a single origin, and no CORS
# configuration to get wrong. On Cloud Run this container also inherits a
# Google identity from its service account, which is what removes the need
# for `gcloud auth application-default login` and for any service-account
# key file.

# ---------------------------------------------------------------------------
# Stage 1: build the React app.
# ---------------------------------------------------------------------------
FROM node:22-slim AS frontend

WORKDIR /build
# Copy the lockfile first so this layer is cached unless dependencies change.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: the Python runtime that serves both.
# ---------------------------------------------------------------------------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# RDKit's drawing module links against system libraries that python:3.11-slim
# does not ship. It fails at *import* time, not at request time, so missing
# one of these takes the whole service down rather than just one endpoint.
# libexpat1 is the one that is easy to miss: rdMolDraw2D needs an XML parser
# even though everything we draw comes out as SVG text.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libxrender1 \
        libxext6 \
        libsm6 \
        libexpat1 \
        libglib2.0-0 \
        libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

# IUPAC naming needs a Java runtime, because py2opsin wraps OPSIN. This used
# to be commented out, on the reasoning that it adds roughly 200 MB and a
# little cold-start time and that judge/naming.py reports `unsupported`
# cleanly without it.
#
# Reporting it cleanly turned out to be the whole problem. Four of the
# organic and structure question types resolve a molecule written by *name*
# -- "Draw this named compound", "Name this structure", "Draw an isomer of
# this", "Predict the product" -- and every one of them went through OPSIN.
# So on the deployed service they all answered "outside what we can check
# yet", every session opened 422 so their hints fell back to the static
# floor, and "Draw any molecule containing this group" was the only organic
# question that worked at all. The gate was doing exactly what it was
# written to do and it read, to a student, as the subject being broken.
#
# The gate in judge/naming.py stays: it is what keeps Java off a teammate's
# laptop and out of the test suite. It just is not what the demo runs on.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./

# The built frontend lands where main.py looks for it. If this directory is
# missing the app still runs as a pure API, which is what happens in local
# development.
COPY --from=frontend /build/dist ./static

# Cloud Run injects PORT and expects the container to listen on it.
ENV PORT=8080
EXPOSE 8080

# One worker on purpose. Problem sessions -- the answer vault and the
# level-3 budget -- live in this process's memory, so a second worker would
# hold a second, separate set of them and hints would silently fall back to
# the static floor for half of all requests. uvicorn handles a classroom's
# worth of concurrency on one worker without breaking a sweat.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1
