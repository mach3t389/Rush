import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { SFIcon } from '../../components/ui';
import {
  getMyClientFolders, getMyClientFiles,
  type ClientFileFolder, type ClientFileItem,
} from '../../data/clientSessionStore';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ClientProjectFichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [folders, setFolders] = useState<ClientFileFolder[] | null>(null);
  const [files, setFiles] = useState<ClientFileItem[] | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setFolders(null);
    setFiles(null);
    setCurrentFolderId(null);
    (async () => {
      const [f, i] = await Promise.all([
        getMyClientFolders(projectId),
        getMyClientFiles(projectId),
      ]);
      if (!cancelled) { setFolders(f); setFiles(i); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;

  const loading = folders === null || files === null;
  const currentFolder = folders?.find(f => f.id === currentFolderId) ?? null;
  const subfolders = (folders ?? []).filter(f => f.parentId === currentFolderId);
  const currentFiles = (files ?? []).filter(f => f.parentFolderId === currentFolderId);
  const isEmpty = !loading && subfolders.length === 0 && currentFiles.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {loading && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}

        {!loading && (
          <>
            {currentFolderId !== null && (
              <button
                onClick={() => setCurrentFolderId(currentFolder?.parentId ?? null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
                  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text-2)', fontSize: 12,
                  fontFamily: 'var(--ff-text)', cursor: 'pointer',
                }}
              >
                <SFIcon name="arrow-left" size={14} />
                {t('clientProject.filesBack')}
              </button>
            )}

            {isEmpty && (
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.filesEmpty')}</p>
            )}

            {!isEmpty && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subfolders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                      borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
                      textAlign: 'left', cursor: 'pointer', width: '100%',
                    }}
                  >
                    <SFIcon name="folder" size={16} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{folder.name}</span>
                  </button>
                ))}

                {currentFiles.map(file => (
                  <div
                    key={file.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
                      opacity: file.resourceId ? 0.75 : 1,
                    }}
                  >
                    <SFIcon name={file.resourceId ? 'file-text' : 'file'} size={16} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </p>
                      <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginTop: 2 }}>
                        {file.ext ? file.ext.toUpperCase() : file.type} · {formatBytes(file.size)}
                      </p>
                    </div>
                    {file.resourceId && (
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px',
                      }}>
                        {t('clientProject.filesResourceUnavailable')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
