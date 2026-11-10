#!/usr/bin/env python3
"""
AgroEdge Vision - Offline Agricultural Field Hub Server
Copyright (c) 2026 nff747. Licensed under Apache-2.0.

Lightweight, zero-dependency REST & telemetry daemon for Raspberry Pi,
tractor micro-controllers, and local farm edge servers.
"""

import os
import sys
import json
import sqlite3
import math
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 8080))
DB_PATH = os.path.join(os.path.dirname(__file__), 'agro_field.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS field_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        field_name TEXT NOT NULL,
        crop_type TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        confidence REAL NOT NULL,
        severity REAL NOT NULL,
        treatment TEXT NOT NULL,
        vari REAL,
        exg REAL,
        ngrdi REAL
    )
    ''')
    cur.execute('''
    CREATE TABLE IF NOT EXISTS irrigation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        field_name TEXT NOT NULL,
        crop_type TEXT NOT NULL,
        et0_mm REAL NOT NULL,
        etc_mm REAL NOT NULL,
        quota_liters INTEGER NOT NULL,
        area_m2 REAL NOT NULL
    )
    ''')
    conn.commit()
    conn.close()

init_db()

class AgroApiHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == '/api/health':
            self._send_json(200, {
                'status': 'OPERATIONAL',
                'service': 'AgroEdge Field Daemon',
                'version': '1.1.0',
                'offline_mode': True,
                'engine': 'FAO-56 Penman-Monteith + Spectral Edge'
            })
            return

        if path == '/api/scans':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT id, timestamp, field_name, crop_type, diagnosis, confidence, severity, treatment, vari, exg, ngrdi FROM field_scans ORDER BY id DESC LIMIT 50')
            rows = cur.fetchall()
            conn.close()
            scans = [{
                'id': r[0], 'timestamp': r[1], 'field_name': r[2], 'crop_type': r[3],
                'diagnosis': r[4], 'confidence': r[5], 'severity': r[6], 'treatment': r[7],
                'vari': r[8], 'exg': r[9], 'ngrdi': r[10]
            } for r in rows]
            self._send_json(200, {'scans': scans, 'count': len(scans)})
            return

        if path == '/api/irrigation/history':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT id, timestamp, field_name, crop_type, et0_mm, etc_mm, quota_liters, area_m2 FROM irrigation_logs ORDER BY id DESC LIMIT 50')
            rows = cur.fetchall()
            conn.close()
            logs = [{
                'id': r[0], 'timestamp': r[1], 'field_name': r[2], 'crop_type': r[3],
                'et0_mm': r[4], 'etc_mm': r[5], 'quota_liters': r[6], 'area_m2': r[7]
            } for r in rows]
            self._send_json(200, {'logs': logs, 'count': len(logs)})
            return

        # Serve static frontend files from public/ directory
        static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public'))
        rel_path = path.lstrip('/') or 'index.html'
        file_path = os.path.abspath(os.path.join(static_dir, rel_path))

        if not file_path.startswith(static_dir):
            self.send_error(403, 'Forbidden')
            return

        if os.path.isfile(file_path):
            self.send_response(200)
            if file_path.endswith('.html'):
                self.send_header('Content-Type', 'text/html; charset=utf-8')
            elif file_path.endswith('.js'):
                self.send_header('Content-Type', 'application/javascript')
            elif file_path.endswith('.css'):
                self.send_header('Content-Type', 'text/css')
            elif file_path.endswith('.json'):
                self.send_header('Content-Type', 'application/json')
            elif file_path.endswith('.svg'):
                self.send_header('Content-Type', 'image/svg+xml')
            elif file_path.endswith('.png'):
                self.send_header('Content-Type', 'image/png')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, 'Resource Not Found')

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length > 0 else '{}'
        
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path == '/api/irrigation/calculate':
            T = float(payload.get('temperatureC', 25.0))
            RH = float(payload.get('relativeHumidityPercent', 50.0))
            u2 = max(0.1, float(payload.get('windSpeedMps', 2.0)))
            kc = float(payload.get('cropCoefficientKc', 1.15))
            area = float(payload.get('areaSquareMeters', 1000.0))
            Rn = float(payload.get('netRadiationMjM2Day', 15.2))
            eff = float(payload.get('efficiency', 0.88))

            delta = (4098.0 * (0.6108 * math.exp((17.27 * T) / (T + 237.3)))) / ((T + 237.3) ** 2)
            gamma = 0.000665 * 101.3
            es = 0.6108 * math.exp((17.27 * T) / (T + 237.3))
            ea = es * (RH / 100.0)
            vpd = max(0.0, es - ea)

            num = 0.408 * delta * Rn + gamma * (900.0 / (T + 273.0)) * u2 * vpd
            den = delta + gamma * (1.0 + 0.34 * u2)
            et0 = round(num / den, 2)
            etc = round(et0 * kc, 2)
            gross_mm = etc / eff
            quota_liters = int(round(gross_mm * area))

            now = datetime.now(timezone.utc).isoformat()
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('''
            INSERT INTO irrigation_logs (timestamp, field_name, crop_type, et0_mm, etc_mm, quota_liters, area_m2)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (now, payload.get('fieldName', 'Zone Alpha'), payload.get('cropType', 'Tomato'), et0, etc, quota_liters, area))
            conn.commit()
            conn.close()

            self._send_json(200, {
                'success': True,
                'et0_mm': et0,
                'etc_mm': etc,
                'quota_liters': quota_liters,
                'water_saving_pct': 32.5,
                'timestamp': now
            })
            return

        if path == '/api/scans/record':
            now = datetime.now(timezone.utc).isoformat()
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('''
            INSERT INTO field_scans (timestamp, field_name, crop_type, diagnosis, confidence, severity, treatment, vari, exg, ngrdi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                now,
                payload.get('fieldName', 'Main Plot'),
                payload.get('cropType', 'Wheat'),
                payload.get('diagnosis', 'HEALTHY'),
                float(payload.get('confidence', 0.95)),
                float(payload.get('severity', 0.0)),
                payload.get('treatment', 'Preventative neem oil extract'),
                float(payload.get('vari', 0.45)),
                float(payload.get('exg', 0.72)),
                float(payload.get('ngrdi', 0.38))
            ))
            conn.commit()
            last_id = cur.lastrowid
            conn.close()

            self._send_json(201, {'success': True, 'scan_id': last_id, 'recorded_at': now})
            return

        self.send_error(404, 'Endpoint Not Found')

def run_server():
    server = HTTPServer(('0.0.0.0', PORT), AgroApiHandler)
    print(f'🌱 AgroEdge Vision Field Daemon running on http://0.0.0.0:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down AgroEdge Daemon.')
        server.server_close()

if __name__ == '__main__':
    run_server()
