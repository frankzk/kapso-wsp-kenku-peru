#!/usr/bin/env python3
"""Convierte el nodo fu-s1 del workflow kenku-sales-bot en nodo de funcion
(send-followup-s1, prueba T7), igual que fu-s2 (send-followup-envio) y fu-p5
(send-reminder). Solo arma el JSON localmente: NO llama a la API de Kapso.

Uso:
  python3 scripts/patch_fu_s1.py ENTRADA.json --function-id UUID --out SALIDA.json
  python3 scripts/patch_fu_s1.py ENTRADA.json --revertir --out SALIDA.json

ENTRADA es el GET del workflow ({"data": {"definition": ..., "lock_version": N}}),
una salida de este mismo script ({"flow": {...}}) o una definicion suelta
({"nodes": [...], "edges": [...]}).

Escribe SALIDA con el cuerpo listo para el PATCH:
  {"flow": {"definition": {...}, "lock_version": N}}  (forma que acepta PATCH /workflows/{id})
(sin lock_version si la entrada no lo trae). Antes del PATCH, volver a hacer
GET: el lock_version tiene que ser el VIGENTE, no el de este archivo.

Verifica (y aborta si falla):
  - que fu-s1 existe y sus aristas siguen: fu-g1 -[enviar]-> fu-s1 -> fu-w2;
  - que ninguna referencia function_id del definition queda en null o vacia
    (la API no resuelve function_slug -> function_id; ver CLAUDE.md);
  - que solo cambio el nodo fu-s1 (el resto del definition queda identico).

--revertir vuelve fu-s1 a send_text con el texto exacto de antes (apagado de
emergencia sin redeploy de la funcion).
"""

import argparse
import copy
import json
import re
import sys

NODO = "fu-s1"
FUNCTION_NAME = "send-followup-s1"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Funciones que ya existen en el proyecto Kenku (CLAUDE.md): el id de
# send-followup-s1 no puede ser ninguna de estas.
IDS_EXISTENTES = {
    "21cd24f1-ed57-4303-988c-043bf4bc8069": "shopify-product-lookup",
    "d4e6365e-4736-4e92-872a-259adb6634f2": "product-media-lookup",
    "ae2db7b7-918c-4b73-b36e-979668920347": "quote-order",
    "05a6107d-6488-4bb3-8088-9f2fce140b5e": "check-coverage",
    "f513d5ea-7d45-4623-af58-3b1b810abed0": "create-shopify-order",
    "00dd67bd-df4b-4477-af5c-2530c44a5b60": "notify-team",
    "1708bd8d-0a55-4a1e-9ed7-fe2e543c4305": "customer-lookup",
    "e7c39748-c57c-4322-b532-a31d9ac5949b": "campaign-report",
    "2620cfb9-b8c9-48b0-bed8-b8f2f9ac16a1": "send-buttons",
    "b2aebd00-2661-46e4-8946-419e4b8df13b": "loop-guard",
    "738279fc-0263-4eef-8afa-1e084e17521e": "pause",
    "82d42ab6-6e45-4dc0-be20-ffec6de9b44b": "send-presentation",
    "828f06f7-8b7f-4a42-87e1-cb2fbb7b42e3": "send-reminder",
    "ccb4ba77-0302-4d63-a15f-b6d31539b4e6": "send-followup-envio",
}

# Lo que tenia fu-s1 en Kapso (GET del 2026-11, hig/def_vivo.json).
SEND_TEXT_ORIGINAL = {
    "node_type": "send_text",
    "config": {
        "whatsapp_config_id": None,
        "phone_number_id": None,
        "message": "{{vars.followup_hint}} — ¿te quedó alguna duda? Con gusto te la respondo.",
        "delay_seconds": 0,
        "provider_model_id": None,
        "provider_model_name": None,
        "ai_field_config": {},
        "to_phone_number": None,
    },
    "display_name": "Send Text Message",
}


def falla(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def cargar(path):
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    # GET ({"data": ...}), salida de este script ({"flow": ...}) o suelta.
    data = (raw.get("data") or raw.get("flow") or raw.get("workflow") or raw) if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        falla("la entrada no es un objeto JSON")
    definition = data.get("definition", data)
    if not isinstance(definition.get("nodes"), list) or not isinstance(definition.get("edges"), list):
        falla("no encuentro definition.nodes / definition.edges")
    return definition, data.get("lock_version")


def nodo_por_id(definition, node_id):
    hallados = [n for n in definition["nodes"] if n.get("id") == node_id]
    if len(hallados) != 1:
        falla(f"esperaba exactamente un nodo {node_id}, hay {len(hallados)}")
    return hallados[0]


def verificar_aristas(definition):
    edges = definition["edges"]
    entra = [e for e in edges if e.get("target") == NODO]
    sale = [e for e in edges if e.get("source") == NODO]
    if not any(e.get("source") == "fu-g1" and e.get("label") == "enviar" for e in entra):
        falla("falta la arista fu-g1 -[enviar]-> fu-s1")
    if len(sale) != 1 or sale[0].get("target") != "fu-w2":
        falla(f"fu-s1 deberia salir solo a fu-w2, sale a {[e.get('target') for e in sale]}")


def referencias_funcion(definition):
    """Todas las referencias a funciones que la API necesita con function_id:
    nodos function, decide de tipo function, y cada item de
    flow_agent_function_tools de los nodos agente. Devuelve (ruta, valor)."""
    refs = []
    for i, n in enumerate(definition["nodes"]):
        data = n.get("data") or {}
        cfg = data.get("config") or {}
        nid = n.get("id", f"#{i}")
        tipo = data.get("node_type")
        if tipo == "function":
            refs.append((f"{nid}.config.function_id", cfg.get("function_id")))
        if tipo == "decide" and cfg.get("decision_type") == "function":
            refs.append((f"{nid}.config.function_id", cfg.get("function_id")))
        for j, tool in enumerate(cfg.get("flow_agent_function_tools") or []):
            refs.append((f"{nid}.config.flow_agent_function_tools[{j}].function_id", (tool or {}).get("function_id")))

    # Ademas, cualquier otra clave function_id en cualquier parte del definition.
    vistos = set()

    def walk(obj, ruta):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "function_id":
                    vistos.add((ruta, v))
                walk(v, f"{ruta}.{k}")
        elif isinstance(obj, list):
            for idx, v in enumerate(obj):
                walk(v, f"{ruta}[{idx}]")

    walk(definition, "definition")
    return refs, vistos


def verificar_function_ids(definition):
    refs, sueltas = referencias_funcion(definition)
    malas = [r for r, v in refs if not v]
    malas += [r for r, v in sueltas if not v]
    if malas:
        falla("referencias function_id en null o vacias: " + ", ".join(sorted(set(malas))))
    return len(refs)


def sin_nodo(definition):
    d = copy.deepcopy(definition)
    d["nodes"] = [n for n in d["nodes"] if n.get("id") != NODO]
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada")
    ap.add_argument("--function-id", help="id de send-followup-s1 en el proyecto Kenku")
    ap.add_argument("--revertir", action="store_true", help="volver fu-s1 a send_text")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    definition, lock_version = cargar(args.entrada)
    original = copy.deepcopy(definition)
    verificar_function_ids(original)  # la entrada ya tiene que estar sana
    verificar_aristas(definition)
    nodo = nodo_por_id(definition, NODO)
    antes = nodo["data"].get("node_type")

    if args.revertir:
        if args.function_id:
            falla("--revertir no lleva --function-id")
        nodo["data"] = copy.deepcopy(SEND_TEXT_ORIGINAL)
    else:
        fid = (args.function_id or "").strip().lower()
        if not UUID_RE.match(fid):
            falla("--function-id tiene que ser un UUID (el id de send-followup-s1 en Kapso)")
        if fid in IDS_EXISTENTES:
            falla(f"--function-id es el de {IDS_EXISTENTES[fid]}, no el de send-followup-s1")
        if antes not in ("send_text", "function"):
            falla(f"fu-s1 es {antes}; esperaba send_text")
        # Mismo formato que fu-s2 / fu-p5 en el definition vivo.
        nodo["data"] = {
            "node_type": "function",
            "config": {
                "function_id": fid,
                "function_name": FUNCTION_NAME,
                "save_response_to": None,
            },
            "display_name": f"Function: {FUNCTION_NAME}",
        }

    # Solo cambio fu-s1: id y posicion intactos, el resto identico.
    if sin_nodo(definition) != sin_nodo(original):
        falla("cambio algo fuera de fu-s1")
    if nodo.get("id") != NODO or nodo.get("position") != nodo_por_id(original, NODO).get("position"):
        falla("cambio el id o la posicion de fu-s1")
    verificar_aristas(definition)
    n_refs = verificar_function_ids(definition)

    cuerpo = {"flow": {"definition": definition}}
    if lock_version is not None:
        cuerpo["flow"]["lock_version"] = lock_version
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(cuerpo, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"fu-s1: {antes} -> {nodo['data']['node_type']}"
          + (f" ({nodo['data']['config'].get('function_id')})" if nodo['data']['node_type'] == "function" else ""))
    print(f"referencias function_id verificadas: {n_refs}, ninguna en null")
    print(f"aristas: fu-g1 -[enviar]-> fu-s1 -> fu-w2 intactas")
    print(f"lock_version de la entrada: {lock_version} (usar el VIGENTE al hacer PATCH)")
    print(f"escrito: {args.out}")


if __name__ == "__main__":
    main()
