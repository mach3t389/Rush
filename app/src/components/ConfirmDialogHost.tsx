import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfirmRequest, subscribeConfirm, resolveConfirm } from '../data/confirmStore';
import { SFModal } from './ui/SFModal';
import { SFButton } from './ui';

export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const [request, setRequest] = useState(getConfirmRequest());
  useEffect(() => subscribeConfirm(() => setRequest(getConfirmRequest())), []);

  return (
    <SFModal open={!!request} onClose={() => resolveConfirm(false)} width={400} closeOnBackdrop={false}>
      <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, marginBottom: 20 }}>{request?.message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <SFButton variant="secondary" onClick={() => resolveConfirm(false)}>{request?.cancelLabel ?? t('common.cancel')}</SFButton>
        <SFButton
          variant="primary"
          onClick={() => resolveConfirm(true)}
          style={request?.danger ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' } : undefined}
        >
          {request?.confirmLabel ?? t('common.confirm')}
        </SFButton>
      </div>
    </SFModal>
  );
}
