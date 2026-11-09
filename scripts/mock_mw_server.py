#!/usr/bin/env python3
"""
Tiny mock Merriam-Webster Collegiate API for local E2E testing of Lexica
(see MW_DICT_BASE in src/lib/dictionary.ts). Serves realistic MW-shaped JSON
for a handful of words, assembled from MW's published data-model examples and
the live m-w.com rendering of "engine".

Run: python3 scripts/mock_mw_server.py  (listens on 127.0.0.1:9999)
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

ENGINE = [
    {
        "meta": {"id": "engine:1", "uuid": "e1", "src": "collegiate", "section": "alpha",
                 "stems": ["engine", "engines"], "offensive": False},
        "hwi": {"hw": "en*gine", "prs": [{"ipa": "\u02c8en-j\u0259n", "sound": {"audio": "engine01"}}]},
        "fl": "noun",
        "def": [
            {
                "sseq": [
                    [
                        ["sense", {
                            "sn": "1",
                            "dt": [["text",
                                " {bc} a machine for converting any of various forms of energy into mechanical force and motion "]],
                            "sdsense": {
                                "sd": "also",
                                "dt": [["text",
                                    " {bc} a mechanism or object that serves as an energy source "]],
                            },
                        }],
                    ],
                    [
                        ["sense", {"sn": "2", "dt": [["text", " {bc} a railroad locomotive "]]}],
                    ],
                    [
                        ["sense", {
                            "sn": "3 a",
                            "dt": [["text",
                                " {bc} something used to effect a purpose {bc}{sx|agent||}, {sx|instrument||} "],
                                   ["vis", [{"t": "the {wi}engine{/wi} of the economy"}]]],
                        }],
                        ["sense", {
                            "sn": "b",
                            "dt": [["text",
                                " {bc} something that produces a particular and usually desirable result "]],
                        }],
                    ],
                    [
                        ["sense", {
                            "sn": "4 a",
                            "dt": [["text", " {bc}{d_link|machinery|machinery} "]],
                        }],
                        ["sense", {
                            "sn": "b",
                            "dt": [["text", " {bc} any of various mechanical appliances "],
                                   ["uns", [["text",
                                       "often used in combination {phrase}fire engine{/phrase}"]]]],
                        }],
                        ["sense", {
                            "sn": "c",
                            "dt": [["text",
                                " {bc} a mechanical tool: such as "]],
                            "sdsense": {
                                "sd": "(1)",
                                "dt": [["text", " {bc} an instrument or machine of war "]],
                            },
                        }],
                    ],
                    [
                        ["sense", {
                            "sn": "5",
                            "dt": [["text",
                                " {bc} computer software that performs a fundamental function especially of a larger program "]],
                        }],
                    ],
                    [
                        ["sense", {
                            "sn": "6 a",
                            "sls": ["obsolete"],
                            "dt": [["text", " {bc}{dxt|ingenuity||} "]],
                        }],
                        ["sense", {
                            "sn": "b",
                            "sls": ["obsolete"],
                            "dt": [["text", " {bc} evil contrivance {bc}{dxt|wile||} "]],
                        }],
                    ],
                ]
            }
        ],
        "et": [
            ["text",
             "Middle English {it}engin{/it}, from Anglo-French, from Latin {it}ingenium{/it}, from {it}ingenerare{/it} to engender, from {it}in-{/it} + {it}generare{/it} to generate {ma}{mat|engine|}{/ma}"]
        ],
        "date": "14th century",
        "shortdef": [
            "a machine for converting any of various forms of energy into mechanical force and motion",
            "a railroad locomotive",
            "something used to effect a purpose",
        ],
    }
]

MACHINERY = [
    {
        "meta": {"id": "machinery", "uuid": "m1", "src": "collegiate", "section": "alpha",
                 "stems": ["machinery"], "offensive": False},
        "hwi": {"hw": "ma*chin*ery",
                "prs": [{"ipa": "m\u0259-\u02c8sh\u0113-n\u0259-r\u0113", "sound": {"audio": "machin01"}}]},
        "fl": "noun",
        "def": [
            {
                "sseq": [
                    [
                        ["sense", {
                            "sn": "1 a",
                            "dt": [["text",
                                    " {bc} machines in general or as a functioning unit "],
                                   ["vis", [{"t": "the {wi}machinery{/wi} of a factory"}]]],
                        }],
                        ["sense", {
                            "sn": "b",
                            "dt": [["text",
                                    " {bc} the working parts of a machine "]],
                        }],
                    ],
                    [
                        ["sense", {
                            "sn": "2",
                            "dt": [["text",
                                    " {bc} the means or system by which something is kept in action or a desired result is obtained "]],
                        }],
                    ],
                ]
            }
        ],
        "et": [["text", "from {it}machine{/it} {ma}{mat|machine|}{/ma}"]],
        "date": "circa 1732",
        "shortdef": ["machines in general", "the working parts of a machine"],
    }
]

RESPONSES = {"engine": ENGINE, "machinery": MACHINERY}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0].strip("/")
        key = path.rsplit("/", 1)[-1].lower() if path else ""
        body = json.dumps(RESPONSES.get(key, [f"no mock for {key}"])).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()
