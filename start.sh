#!/usr/bin/env bash
set -e

BASE=/workspace
COMFY=$BASE/ComfyUI

mkdir -p $BASE/models $BASE/outputs $BASE/workflows

if [ ! -d "$COMFY" ]; then
  git clone https://github.com/comfyanonymous/ComfyUI.git $COMFY
fi

ln -sf $BASE/models    $COMFY/models
ln -sf $BASE/outputs   $COMFY/output
ln -sf $BASE/workflows $COMFY/workflows

cd $COMFY
pip3 install -r requirements.txt
python3 main.py --listen 0.0.0.0 --port 8188