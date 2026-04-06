.PHONY: all build build-engine build-endpoint build-backend build-ui \
        up down up-lvfa up-mysql down-lvfa down-mysql \
        dev dev-backend dev-ui dev-engine \
        setup-cli clean test

# ── Docker Build ────────────────────────────────────────

all: build

build: build-engine build-endpoint build-backend build-ui

build-engine:
	docker build -t ontop-aether/engine ./ontop-engine

build-endpoint:
	docker build --build-arg ONTOP_VERSION=5.5.0 -t ontop-aether/endpoint ./ontop-endpoint

build-backend:
	docker build -t ontop-aether/backend ./ontop-backend

build-ui:
	docker build -t ontop-aether/frontend ./ontop-ui

# ── Docker Compose ──────────────────────────────────────

up: build
	docker compose up -d

down:
	docker compose down

up-lvfa: build
	docker compose -f docker-compose.lvfa.yml up -d

down-lvfa:
	docker compose -f docker-compose.lvfa.yml down

up-mysql: build
	docker compose -f docker-compose.mysql.yml up -d

down-mysql:
	docker compose -f docker-compose.mysql.yml down

# ── Local Development ───────────────────────────────────

dev-backend:
	cd ontop-backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

dev-ui:
	cd ontop-ui && pnpm dev

dev-engine:
	cd ontop-engine && mvn spring-boot:run

# ── Utilities ───────────────────────────────────────────

setup-cli:
	@mkdir -p ontop-endpoint/ontop-cli
	@curl -L -o /tmp/ontop-cli.zip https://github.com/ontop/ontop/releases/download/ontop-5.5.0/ontop-cli-5.5.0.zip
	@unzip -o /tmp/ontop-cli.zip -d ontop-endpoint/ontop-cli
	@chmod +x ontop-endpoint/ontop-cli/ontop
	@rm /tmp/ontop-cli.zip
	@echo "Ontop CLI installed to ontop-endpoint/ontop-cli/"

clean:
	rm -rf ontop-backend/__pycache__ ontop-backend/*/__pycache__
	rm -rf ontop-ui/.next ontop-ui/node_modules
	rm -rf ontop-engine/target
	rm -rf logs/*.log

test:
	cd ontop-backend && python -m pytest tests/ -v
