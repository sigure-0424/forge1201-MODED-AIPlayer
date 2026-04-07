# docker/forge-server/Dockerfile
# スタンドアロン Forge 1.20.1 サーバーイメージ
# ─────────────────────────────────────────────────────────────
# 用途: mods/ を Docker イメージに焼き込みたい場合に使用。
#       compose.yaml の forge-server サービスは通常 itzg/minecraft-server を
#       直接使うが、CI/CD やオフライン環境ではこのイメージを使う。
#
# ビルド方法 (リポジトリルートから):
#   docker build -f docker/forge-server/Dockerfile \
#     --build-arg SERVER_DIR=E:/forge1201server \
#     -t forgeaip-forge-server .
#
# ※ SERVER_DIR は Docker build context に含まれている必要がある。
#    ネットワーク経由での Forge インストールが必要なため、
#    ビルド時はインターネット接続が必要。
# ─────────────────────────────────────────────────────────────

FROM eclipse-temurin:17-jre-jammy AS base

# Forge インストーラー取得に必要なツール
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Forge インストーラーを実行 ────────────────────────────────
WORKDIR /forge-install

ARG FORGE_VERSION=1.20.1-47.4.10
ARG INSTALLER_URL=https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar

RUN curl -fsSL "${INSTALLER_URL}" -o forge-installer.jar && \
    java -jar forge-installer.jar --installServer && \
    rm -f forge-installer.jar forge-installer.jar.log

# ─── サーバーディレクトリ構築 ─────────────────────────────────
WORKDIR /mc-server

# インストール済みファイルを移動
RUN cp -r /forge-install/. /mc-server/

# EULA 同意
RUN echo "eula=true" > eula.txt

# server.properties の基本設定
RUN printf \
    "online-mode=false\n\
max-players=10\n\
view-distance=8\n\
simulation-distance=6\n\
spawn-protection=0\n\
difficulty=normal\n\
allow-flight=true\n\
enforce-whitelist=false\n" > server.properties

# JVM 引数ファイル
RUN printf "-Xms2G\n-Xmx4G\n-XX:+UseG1GC\n-XX:MaxGCPauseMillis=50\n" > user_jvm_args.txt

# ─── mods/ をイメージに組み込む (任意) ───────────────────────
# ビルド時に --build-arg INCLUDE_MODS=true を渡した場合のみ
# BUILD CONTEXT に mods/ ディレクトリが存在する必要がある。
ARG INCLUDE_MODS=false
COPY --chown=root:root . /build-context/
RUN if [ "$INCLUDE_MODS" = "true" ] && [ -d /build-context/mods ]; then \
        mkdir -p /mc-server/mods && \
        cp -r /build-context/mods/. /mc-server/mods/; \
    fi

# ─── 起動スクリプト ───────────────────────────────────────────
RUN printf '#!/bin/sh\nset -e\nexec java @user_jvm_args.txt @libraries/net/minecraftforge/forge/%s/unix_args.txt nogui "$@"\n' \
    "${FORGE_VERSION}" > /mc-server/start.sh && chmod +x /mc-server/start.sh

EXPOSE 25565

WORKDIR /mc-server

# mods/ と config/ をボリュームとして外部から上書き可能に
VOLUME ["/mc-server/mods", "/mc-server/config", "/mc-server/world"]

ENTRYPOINT ["/mc-server/start.sh"]
