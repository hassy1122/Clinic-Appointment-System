import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ClinicInfo } from '../lib/types';

/** Public clinic info — mainly needed for the display timezone. */
export function useClinic() {
  return useQuery({
    queryKey: ['clinic'],
    queryFn: async () => {
      const res = await api<{ clinic: ClinicInfo }>('/clinic');
      return res.clinic;
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** Display timezone: clinic timezone once loaded, browser timezone before that. */
export function useDisplayTz(): string | undefined {
  const { data } = useClinic();
  return data?.timezone;
}
