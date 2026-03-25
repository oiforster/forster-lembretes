#!/usr/bin/env python3
"""
verificar.py — Forster Filmes
Verifica vencimentos e dispara lembretes via WhatsApp.

Roda todo dia às 9h pelo launchd.
Envía lembrete para clientes com vencimento daqui a 5 dias.

Uso manual: python3 verificar.py
Modo teste:  python3 verificar.py --teste
"""

import csv
import subprocess
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CSV_PATH = SCRIPT_DIR / "clientes.csv"
LOG_PATH = SCRIPT_DIR / "logs" / "historico.log"
DIAS_ANTECEDENCIA = 5

MODO_TESTE = "--teste" in sys.argv


def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linha = f"[{timestamp}] {msg}"
    print(linha)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(linha + "\n")


def notificar(titulo: str, mensagem: str):
    script = f'display alert "💸 {titulo}" message "{mensagem}" buttons {{"OK"}} default button "OK"'
    subprocess.run(["osascript", "-e", script], capture_output=True)


def main():
    hoje = datetime.today().date()
    alvo = hoje + timedelta(days=DIAS_ANTECEDENCIA)

    log(f"=== Verificação iniciada | Hoje: {hoje.strftime('%d/%m/%Y')} | Alvo: {alvo.strftime('%d/%m/%Y')} ===")

    if not CSV_PATH.exists():
        log(f"ERRO: Arquivo de clientes não encontrado em {CSV_PATH}")
        sys.exit(1)

    enviados = 0
    erros = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            # Pula clientes inativos ou incompletos
            if row.get("ativo", "").strip().lower() != "sim":
                continue

            cliente = row["cliente"].strip()
            whatsapp = row["whatsapp"].strip()
            chave_pix = row["chave_pix"].strip()

            try:
                dia_venc = int(row["dia_vencimento"].strip())
            except (ValueError, KeyError):
                log(f"AVISO: Dia de vencimento inválido para {cliente} — pulando")
                continue

            # Verifica se o vencimento deste mês cai no dia alvo
            # (considera também o mês seguinte se alvo cruzar mês)
            try:
                data_venc = alvo.replace(day=dia_venc)
            except ValueError:
                # Dia não existe neste mês (ex: dia 31 em fevereiro)
                # Usa o último dia do mês alvo
                import calendar
                ultimo_dia = calendar.monthrange(alvo.year, alvo.month)[1]
                data_venc = alvo.replace(day=ultimo_dia)

            if data_venc != alvo:
                continue

            data_fmt = alvo.strftime("%d/%m")
            log(f"Disparando lembrete → {cliente} | Vencimento: {data_fmt} | WhatsApp: {whatsapp}")

            if MODO_TESTE:
                log(f"  [TESTE] Mensagem NÃO enviada (modo teste ativo)")
                log(f"  [TESTE] PIX: {chave_pix}")
                enviados += 1
                continue

            resultado = subprocess.run(
                ["node", "disparar.js", cliente, whatsapp, data_fmt, chave_pix],
                cwd=SCRIPT_DIR,
                capture_output=True,
                text=True,
                timeout=120
            )

            if resultado.returncode == 0:
                log(f"  ✓ Enviado com sucesso")
                notificar("Forster Filmes · Lembretes", f"✓ Lembrete enviado para {cliente}")
                enviados += 1
            else:
                log(f"  ✗ Falha: {resultado.stderr.strip()}")
                notificar("Forster Filmes · Lembretes", f"✗ Falha ao enviar para {cliente}")
                erros += 1

    if enviados == 0 and erros == 0:
        log("Nenhum vencimento em 5 dias. Nada a enviar.")
        notificar("Forster Filmes · Lembretes", "Sem mensagens para hoje.")
    else:
        log(f"=== Concluído: {enviados} enviado(s), {erros} erro(s) ===")
        if erros == 0:
            notificar("Forster Filmes · Lembretes", f"✓ {enviados} lembrete(s) enviado(s) com sucesso.")
        else:
            notificar("Forster Filmes · Lembretes", f"{enviados} enviado(s), {erros} com erro — veja o log.")


if __name__ == "__main__":
    main()
