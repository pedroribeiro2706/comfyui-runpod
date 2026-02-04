FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /workspace

# Sistema
RUN apt-get update && apt-get install -y \
    python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*

# Python
RUN pip3 install --upgrade pip && \
    pip3 install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121

# Start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8188
ENTRYPOINT ["/start.sh"]
