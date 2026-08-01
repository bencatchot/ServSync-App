import type { ContractorProfile, ContractorTeamAccess } from '../../types';

export type PriceBookAccess = {
  canView: boolean;
  canManage: boolean;
};

export function contractorPriceBookAccess(
  contractor: Pick<ContractorProfile, 'owner_user_id'> | null | undefined,
  teamAccess: ContractorTeamAccess | null | undefined,
  profileId: string,
): PriceBookAccess {
  if (!contractor) return { canView: false, canManage: false };
  if (contractor.owner_user_id === profileId) return { canView: true, canManage: true };

  const activeMember = teamAccess?.members.find(member => member.user_id === profileId && member.status === 'active');
  if (!activeMember) return { canView: false, canManage: false };

  return {
    canView: true,
    canManage: activeMember.role === 'admin' || activeMember.role === 'office',
  };
}
