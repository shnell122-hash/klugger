import { api, fmt, type PaymentConfirmation } from '@/lib/api';
import PagosClient from './PagosClient';


export default async function PagosPage() {
  const pagos = await api.getPaymentConfirmations('limit=200').catch(() => [] as PaymentConfirmation[]);
  return <PagosClient pagos={pagos} />;
}
