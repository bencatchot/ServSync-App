import type { ContractorProfile, ContractorTeamAccess } from '../../types';

type ContractorOwner = Pick<ContractorProfile, 'owner_user_id'>;

export function canManageContractorCustomersUi(
  contractor: ContractorOwner | null | undefined,
  teamAccess: ContractorTeamAccess | null | undefined,
  profileId: string,
) {
  if (!contractor || !profileId) return false;
  if (contractor.owner_user_id === profileId) return true;

  const activeMember = teamAccess?.members.find(
    member => member.user_id === profileId && member.status === 'active',
  );
  return activeMember?.role === 'admin' || activeMember?.role === 'office';
}

export function canCreateContractorLocalCustomersUi(
  contractor: ContractorOwner | null | undefined,
  profileId: string,
) {
  return Boolean(contractor && profileId && contractor.owner_user_id === profileId);
}
