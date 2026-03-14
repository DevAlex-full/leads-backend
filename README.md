# ⚙️ Leads Backend

API Express para scraping de leads multi-nicho via Apify.

---

## 🚀 Setup local

```bash
cd leads-backend
npm install
cp .env.example .env
```

Edite `.env`:
```env
PORT=3001
ALLOWED_ORIGIN=http://localhost:3000
NODE_ENV=development
```

```bash
npm run dev
# http://localhost:3001
```

---

## 🌐 Deploy no Render

1. Crie um novo **Web Service** no [render.com](https://render.com)
2. Conecte o repositório `leads-backend`
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Adicione as variáveis de ambiente:
   - `ALLOWED_ORIGIN` → URL do frontend no Vercel (ex: `https://leads-frontend.vercel.app`)
   - `NODE_ENV` → `production`

---

## 📡 Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status do servidor |
| `POST` | `/api/scrape/start` | Inicia um job de scraping |
| `GET` | `/api/scrape/status/:jobId` | Status + logs do job |
| `GET` | `/api/scrape/results/:jobId` | Leads completos (só após done) |
| `GET` | `/api/scrape/download/:jobId?format=md\|csv&niche=X` | Baixa arquivo |
| `DELETE` | `/api/scrape/cancel/:jobId` | Cancela o job |

### POST /api/scrape/start — body

```json
{
  "apiKey": "apify_api_XXXX",
  "niche": "barbearia",
  "cities": ["São Paulo", "Rio de Janeiro"],
  "perCity": 15,
  "sources": ["google_maps", "instagram"]
}
```

---

## 📁 Estrutura

```
leads-backend/
├── src/
│   ├── index.ts                    # Entry point
│   ├── routes/
│   │   ├── health.ts
│   │   └── scrape.ts               # Todas as rotas de scraping
│   ├── services/
│   │   ├── apify.ts                # Comunicação com Apify API
│   │   ├── scrapeOrchestrator.ts   # Orquestra multi-fonte
│   │   ├── jobStore.ts             # Jobs em memória
│   │   ├── exporters.ts            # Gera .md e .csv
│   │   └── parsers/
│   │       ├── googleMaps.ts
│   │       ├── instagram.ts
│   │       ├── linkedin.ts
│   │       └── facebook.ts
│   ├── middlewares/
│   │   ├── cors.ts
│   │   └── validation.ts           # Zod schema
│   └── lib/
│       └── types.ts
├── render.yaml
├── .env.example
└── package.json
```
