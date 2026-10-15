import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/layout/EmptyState';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header title="Страница не найдена" />
      <EmptyState
        emoji="🧭"
        title="Такой страницы нет"
        description="Возможно, ссылка устарела. Давайте поищем, где поесть?"
        action={{ label: 'Места рядом', onClick: () => navigate('/nearby') }}
        secondaryAction={{ label: 'Крутить рулетку', onClick: () => navigate('/roulette') }}
      />
    </div>
  );
}
