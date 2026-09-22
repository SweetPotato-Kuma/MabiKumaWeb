import type { ItemOption } from '@/features/auction/types';

/** 아이템 세부 옵션을 한 줄씩 보여준다. */
export function ItemOptionList({ options }: { options: ItemOption[] | undefined }) {
  if (!options || options.length === 0) {
    return <span className="muted">-</span>;
  }

  return (
    <ul className="option-list">
      {options.map((option, index) => (
        <li key={`${option.option_type}-${option.option_sub_type ?? ''}-${index}`}>
          <span className="option-list__type">
            {option.option_type}
            {option.option_sub_type ? ` · ${option.option_sub_type}` : ''}
          </span>
          <span className="option-list__value">
            {[option.option_value, option.option_value2].filter(Boolean).join(' ~ ') || '-'}
          </span>
          {option.option_desc ? (
            <span className="option-list__desc">{option.option_desc}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
