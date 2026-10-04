// Endereço da API do cmport-system. Em produção o Nginx expõe o FastAPI em /api/v1.
// Para apontar pra um backend local, crie um .env.local com
// EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:8000/api/v1
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://dash.cmport.com.br/api/v1').replace(/\/+$/, '');
