const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const controller = fs.readFileSync(path.join(__dirname, 'automation', '9router-control.ps1'), 'utf8');

test('releases only snapshotted npm shims before global package installation', () => {
    const backup = controller.indexOf('$transaction = Backup-GlobalInstall -Prepared $Prepared');
    const release = controller.indexOf('Remove-ManagedCommandShimsForNpmInstall -Transaction $transaction', backup);
    const install = controller.indexOf('& $NpmCmd install -g $Prepared.tarball', backup);

    assert.ok(backup >= 0, 'transaction backup must exist');
    assert.ok(release > backup, 'managed shims must be released after the rollback snapshot');
    assert.ok(install > release, 'npm install must run only after managed shims are released');
    assert.match(controller, /foreach \(\$name in @\("9router", "9router\.cmd", "9router\.ps1"\)\)/);
    assert.match(controller, /Remove-Item -LiteralPath \$livePath -Force/);
});
