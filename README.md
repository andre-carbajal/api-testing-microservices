# API Testing in Microservices — Companion Repository

> Real-world code for the dev.to article **"Applying API Testing Frameworks: Real-World Microservices Examples"**
> by [@andre-carbajal](https://github.com/andre-carbajal)

## Architecture

Three Express microservices communicating over HTTP:

```
┌──────────────┐     JWT auth      ┌───────────────┐
│  user-service│ ◄───────────────► │  order-service│
│   :3001      │                   │   :3003       │
└──────────────┘                   └──────┬────────┘
                                          │ stock check
                                          ▼
                                   ┌───────────────┐
                                   │product-service│
                                   │   :3002       │
                                   └───────────────┘
```

| Service | Port | Responsibility |
|---------|------|----------------|
| user-service | 3001 | Registration, JWT auth, user profiles |
| product-service | 3002 | Product catalog, stock management |
| order-service | 3003 | Order creation, history (calls product-service) |

## Test suites

| Suite | Framework | Type | Location |
|-------|-----------|------|----------|
| `user-service.test.js` | Jest + Supertest | Unit / in-process | `tests/jest/` |
| `product-service.test.js` | Jest + Supertest | Unit / in-process | `tests/jest/` |
| `order-service.test.js` | Jest + Supertest | Unit (mocked HTTP) | `tests/jest/` |
| `test_user_service.py` | Pytest + HTTPX | Integration | `tests/pytest/` |
| `test_order_flow.py` | Pytest + HTTPX | End-to-end | `tests/pytest/` |

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.11+

### Install dependencies

```bash
# Node services
cd services/user-service && npm install
cd ../product-service && npm install
cd ../order-service && npm install

# Jest tests
cd ../../tests/jest && npm install

# Pytest tests
cd ../pytest && pip install -r requirements.txt
```

### Run Jest tests (unit — no running services needed)

```bash
cd tests/jest
npm test
```

### Run Pytest tests (integration — starts services automatically)

```bash
# Make sure Node services have their node_modules installed first
cd tests/pytest
pytest -v
```

### Run all services manually

```bash
# Terminal 1
cd services/user-service && npm start

# Terminal 2
cd services/product-service && npm start

# Terminal 3
cd services/order-service && npm start
```

## Project structure

```
api-testing-microservices/
├── services/
│   ├── user-service/
│   │   └── src/index.js        # Express app: auth + user routes
│   ├── product-service/
│   │   └── src/index.js        # Express app: catalog + stock routes
│   └── order-service/
│       └── src/index.js        # Express app: order routes (calls product-service)
└── tests/
    ├── jest/
    │   ├── package.json
    │   ├── user-service.test.js
    │   ├── product-service.test.js
    │   └── order-service.test.js
    └── pytest/
        ├── requirements.txt
        ├── pytest.ini
        ├── conftest.py          # Shared fixtures: start services, auth helpers
        ├── test_user_service.py
        └── test_order_flow.py   # Full end-to-end scenario
```

## License

MIT
