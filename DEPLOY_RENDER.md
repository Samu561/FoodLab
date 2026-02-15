# Deploy permanente en Render (URL pública)

## Requisitos
- Cuenta de GitHub
- Cuenta de Render
- Proyecto en este path: `/Users/samu/Documents/New project 7`

## 1) Preparar local
```bash
cd "/Users/samu/Documents/New project 7"
npm install
npm start
```
Abrir: `http://localhost:3000`

## 2) Subir a GitHub
```bash
git add .
git commit -m "FoodLab listo para deploy"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

## 3) Crear el Web Service en Render
1. Ir a [Render Dashboard](https://dashboard.render.com/)
2. `New` -> `Web Service`
3. Conectar tu repo
4. Configurar:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
   - Plan: Free (o pago si quieres más estabilidad)
5. Deploy

## 4) URL pública
Render te dará URL tipo:
- `https://foodlab-eafit.onrender.com`

Comparte esa URL y pueden entrar desde cualquier lugar.

## 5) Nota de base de datos (importante)
Este proyecto usa SQLite (`foodlab.db`). En servicios free, el filesystem puede no ser persistente a largo plazo. Si quieres persistencia fuerte de datos:
1. Migrar a PostgreSQL de Render.
2. O usar un servicio con disco persistente.

## 6) Verificación rápida
Cuando esté arriba, prueba:
- `https://TU-URL.onrender.com/api/health`
Debe responder algo como:
```json
{"ok":true,"version":"foodlab-2026-02-15-c"}
```
