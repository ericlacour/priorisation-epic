import { SessionStatus } from '../api/session-state';

/** La classe du badge d'un statut de session, la même dans la barre de session et dans la liste des sessions. */
export function statusBadge(status: SessionStatus | undefined): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'badge live';
    case 'CLOSED':
      return 'badge closed';
    default:
      return 'badge prep';
  }
}
