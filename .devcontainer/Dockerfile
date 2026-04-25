FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System deps for Tauri on Linux
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    libwebkit2gtk-4.1-dev \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    pkg-config \
    file \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust via rustup (non-interactive)
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --no-modify-path \
    && rustup default stable

# Use host-compatible UID/GID for bind mounts and writable node_modules volume
RUN mkdir -p /workspace/node_modules \
    && chown -R 1000:1000 /workspace
USER 1000:1000
WORKDIR /workspace
