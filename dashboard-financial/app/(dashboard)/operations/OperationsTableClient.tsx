'use client';
import { useState } from 'react';
import OperationsTable from '@/components/tables/OperationsTable';
import { api } from '@/lib/api';
import type { Operation } from '@/lib/api';

export default function OperationsTableClient({ initialData }: { initialData: Operation[] }) {
  const [data, setData] = useState(initialData);

  const handleMarcarRetorno = async (id: number) => {
    await api.marcarRetorno(id);
    setData(prev => prev.map(op =>
      op.id === id ? { ...op, retorno_pagado: true, estado: 'completada' } : op
    ));
  };

  return <OperationsTable data={data} onMarcarRetorno={handleMarcarRetorno} />;
}
