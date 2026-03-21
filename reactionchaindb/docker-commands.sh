docker run -d \
  --name homeassistant \
  --restart=unless-stopped \
  -e TZ=Europe/Copenhagen \
  -v /home/username/homeassistant_config:/config \
  --network=host \
  ghcr.io/home-assistant/home-assistant:stable





docker run -d \
  --name deconz \
  --restart unless-stopped \
  -v ~/deconz:/root/.local/share/dresden-elektronik/deCONZ \
  --device /dev/ttyACM0 \
  -e DECONZ_WEB_PORT=8080 \
  --network=host \
  marthoc/deconz
