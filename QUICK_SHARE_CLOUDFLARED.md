# Compartir FoodLab fuera de tu red (rápido con cloudflared)

## 1) Arranca la app local
```bash
cd "/Users/samu/Documents/New project 7"
npm install
npm start
```

## 2) Instala cloudflared (macOS)
Si tienes Homebrew:
```bash
brew install cloudflared
```

Si NO tienes Homebrew:
1. Descarga el binario desde:
   - https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Muévelo a una ruta en tu PATH, por ejemplo:
```bash
sudo mv ~/Downloads/cloudflared /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

## 3) Crea túnel público temporal
En otra terminal:
```bash
cloudflared tunnel --url http://localhost:3000
```

Te va a mostrar una URL pública tipo:
- `https://algo-aleatorio.trycloudflare.com`

Comparte esa URL y cualquier persona con internet puede entrar.

## 4) Notas
- Mientras el comando esté corriendo, la URL funciona.
- Si cierras la terminal, el enlace cae.
- Para demo es perfecto; para producción estable usa Render (archivo `DEPLOY_RENDER.md`).
