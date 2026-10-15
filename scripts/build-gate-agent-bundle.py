"""Build the connector from current sources and the supplied SDK; no credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import json

root = Path(__file__).resolve().parent.parent
sdk_zip = root / 'standalone+sdk-6.3.1.37-doc-2.1.0-demo-1.1.15.zip'
assert sha256(sdk_zip.read_bytes()).hexdigest() == 'ea28338da07864533a7bcc2142333b8398850dc62a5871fc8d6d5f6bc77d4ec6'
files = ['Install-One80GateAgent.cmd', 'Install-One80GateAgent.ps1', 'One80.GateAgent.ps1', 'Test-One80GateAgent.ps1', 'Run-One80GateCheck.cmd', 'config.example.json', 'README.md']
dlls = ['plcommpro.dll', 'plcomms.dll', 'plrscomm.dll', 'pltcpcomm.dll', 'plrscagent.dll']
name = 'ONE80-GateAgent-Windows-1.1.0'
output = root / 'frontend/public/downloads' / (name + '.zip')
output.parent.mkdir(parents=True, exist_ok=True)
manifest = {}
with ZipFile(output, 'w', ZIP_DEFLATED) as out, ZipFile(sdk_zip) as sdk:
    def add(path, data):
        out.writestr(name + '/' + path, data)
        manifest[path] = sha256(data).hexdigest()
    for f in files:
        add(f, (root / 'gate-agent/windows' / f).read_bytes())
    for f in dlls:
        data = sdk.read('SDK-Ver6.3.1.37/64bit/' + f)
        offset = int.from_bytes(data[60:64], 'little')
        assert data[offset:offset+4] == b'PE\0\0' and int.from_bytes(data[offset+4:offset+6], 'little') == 0x8664
        add('sdk/' + f, data)
    add('START-HERE-AR.md', (root / 'docs/gate-access/RELEASE-1.1.0-AR.md').read_bytes())
    add('SDK-PROVENANCE.txt', (root / 'docs/gate-access/SDK-PROVENANCE.txt').read_bytes())
    out.writestr(name + '/SHA256.json', json.dumps(manifest, indent=2))
with ZipFile(output) as check:
    assert check.testzip() is None
    for f, digest in manifest.items():
        assert sha256(check.read(name + '/' + f)).hexdigest() == digest
    assert not any(p.endswith('/one80-gate-setup.json') for p in check.namelist())
copy = root / 'dist' / output.name
copy.parent.mkdir(exist_ok=True)
copy.write_bytes(output.read_bytes())
print(f'Verified {len(manifest)} files (5 x64 SDK DLLs), no runtime credentials: {copy}')
