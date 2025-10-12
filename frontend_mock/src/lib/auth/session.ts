import { getServerSession } from 'next-auth';
import { authConfig as authOptions } from '@/lib/auth/config';

export const getAuthSession = () => getServerSession(authOptions);
