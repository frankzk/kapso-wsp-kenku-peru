"""Revisa los pedidos que el bot crea en WooCommerce desde una hora dada.

Uso: KAPSO_API_KEY=... python3 scripts/revisar_pedidos_woo.py [desde]
  desde: ISO con zona (ej. 2026-10-26T09:00:00-05:00). Por defecto, hace 6 h.

Lista cada llamada a create_shopify_order y su resultado, confirma cada
pedido creado leyendolo de vuelta de la tienda (customer-lookup en modo
WooCommerce) y cuenta las ejecuciones fallidas del periodo.
"""
import collections
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["KAPSO_API_KEY"]
B = "https://api.kapso.ai/platform/v1"
WID = "5d45d805-b52f-4d82-8c77-b8dd680718fc"
CUSTOMER_LOOKUP = "1708bd8d-0a55-4a1e-9ed7-fe2e543c4305"
LIMA = dt.timezone(dt.timedelta(hours=-5))


def parse(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def get(url):
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={"X-API-Key": KEY})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(2 * (i + 1))
    return {}


def invoke(fid, body):
    req = urllib.request.Request(
        f"{B}/functions/{fid}/invoke", data=json.dumps(body).encode(), method="POST",
        headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    d = d.get("data", d)
    res = d.get("result", d) if isinstance(d, dict) else d
    return json.loads(res) if isinstance(res, str) else res


desde = parse(sys.argv[1]) if len(sys.argv) > 1 else dt.datetime.now(LIMA) - dt.timedelta(hours=6)

# Una ejecucion queda abierta ("waiting") dias enteros y puede crear el pedido
# mucho despues de empezar: se filtra por la ultima actividad, no por el inicio.
ejecuciones = []
for page in range(1, 200):
    data = get(f"{B}/workflows/{WID}/executions?per_page=100&page={page}").get("data", [])
    ejecuciones += [e for e in data if parse(e.get("last_event_at") or e["started_at"]) >= desde]
    if not data or min(parse(e["started_at"]) for e in data) < desde - dt.timedelta(days=4):
        break

def eventos(e):
    return e, get(f"{B}/workflow_executions/{e['id']}/events?per_page=200").get("data", [])

llamadas = []
with ThreadPoolExecutor(8) as pool:
    for e, evs in pool.map(eventos, ejecuciones):
        pendiente = None
        for x in sorted(evs, key=lambda x: x["created_at"]):
            pl = x.get("payload") or {}
            if x["event_type"] == "agent_tool_called" and pl.get("tool_name") == "create_shopify_order":
                cliente = ((pl.get("parameters") or {}).get("input") or {}).get("customer") or {}
                pendiente = {"exec": e["id"], "t": parse(x["created_at"]), "cliente": cliente, "resultado": None}
                if pendiente["t"] >= desde:
                    llamadas.append(pendiente)
            elif pendiente and pendiente["resultado"] is None and x["event_type"] in ("agent_tool_response", "agent_tool_failed", "agent_tool_error"):
                r = pl.get("result", pl)
                try:
                    pendiente["resultado"] = json.loads(r) if isinstance(r, str) else r
                except ValueError:
                    pendiente["resultado"] = {"raw": str(r)[:300]}
                pendiente = None

estados = collections.Counter(e["status"] for e in ejecuciones)
fallidas = [e for e in ejecuciones if e["status"] == "failed" and parse(e.get("ended_at") or e.get("last_event_at") or e["started_at"]) >= desde]
print(f"Desde {desde.astimezone(LIMA):%d/%m %H:%M} Lima: {len(ejecuciones)} ejecuciones con actividad {dict(estados)}")
print(f"Llamadas a crear pedido: {len(llamadas)}")

creados, problemas = [], []
for c in sorted(llamadas, key=lambda c: c["t"]):
    r = c["resultado"] or {}
    orden = r.get("order") or {}
    cli = c["cliente"]
    linea = (f"  {c['t'].astimezone(LIMA):%d %H:%M} {cli.get('name')} {cli.get('phone')} "
             f"{cli.get('district')} -> backend={r.get('backend')} ok={r.get('ok')} "
             f"{r.get('reason') or r.get('conversionStatus')} {orden.get('name') or ''} {orden.get('total') or ''}")
    print(linea)
    if r.get("ok") and orden.get("name") and r.get("conversionStatus") == "confirmed":
        creados.append((cli.get("phone"), orden["name"]))
    elif not r.get("ok"):
        problemas.append(linea.strip() + " | " + (r.get("message") or r.get("error") or json.dumps(r)[:200]))
    if r.get("backend") and r.get("backend") != "woocommerce":
        problemas.append("BACKEND NO ES WOOCOMMERCE: " + linea.strip())

print("Verificacion en WooCommerce:")
for tel, nombre in creados:
    try:
        res = invoke(CUSTOMER_LOOKUP, {"input": {"phone": tel}})
        ultimo = (res.get("customer") or {}).get("lastOrderName")
        tienda = res.get("store") or (res.get("vars") or {}).get("store")
        marca = "OK" if ultimo == nombre and tienda == "woocommerce" else "REVISAR"
        print(f"  {marca} {nombre}: tienda={tienda} ultimo pedido del cliente={ultimo}")
        if marca != "OK":
            problemas.append(f"{nombre} no aparece como ultimo pedido en WooCommerce (ve {ultimo}, tienda {tienda})")
    except Exception as exc:
        problemas.append(f"No se pudo verificar {nombre}: {exc}")

if fallidas:
    problemas.append(f"{len(fallidas)} ejecuciones fallidas: " + ", ".join(e["id"][:8] for e in fallidas[:10]))
print("PROBLEMAS:" if problemas else "Sin problemas.")
for p in problemas:
    print("  -", p)
