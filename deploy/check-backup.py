"""Read-only inventory plus SQLite online backup and isolated restore integrity check."""
import pathlib,sqlite3,json,os,hashlib,shutil
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'deploy'/'strix-stage'
src=root/'data'/'studio.sqlite'
if not src.exists():
 print('No existing source database; fresh appdata required after GO.')
 raise SystemExit(0)
private=pathlib.Path('/home/helix/.hermes-minimal/cache/scratch/creator-studio-deploy-backup')
private.mkdir(mode=0o700,exist_ok=True)
os.chmod(private,0o700)
backup=private/'studio-backup.sqlite';restored=private/'studio-restored.sqlite'
assert not backup.exists() and not restored.exists(), 'Refuse overwrite'
s=sqlite3.connect(f'file:{src}?mode=ro',uri=True)
b=sqlite3.connect(backup);s.backup(b);b.close();os.chmod(backup,0o600)
shutil.copy2(backup,restored)
r=sqlite3.connect(restored)
tables=[x[0] for x in s.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
counts={t:s.execute('SELECT count(*) FROM "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}
restored_counts={t:r.execute('SELECT count(*) FROM "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}
assert counts==restored_counts
assert r.execute('pragma integrity_check').fetchone()[0]=='ok'
result={'source':str(src),'counts':counts,'restored_counts_equal':True,'integrity':'ok','private_backup':str(backup),'private_restore':str(restored),'scope':'SQLite only, not full appdata or authenticated restore; release drill still needed'}
(out/'backup-restore.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
