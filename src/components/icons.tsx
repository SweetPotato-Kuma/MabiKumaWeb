import type { ComponentProps } from 'react';
import addSvg from '@material-symbols/svg-400/rounded/add.svg?raw';
import bugReportSvg from '@material-symbols/svg-400/rounded/bug_report.svg?raw';
import chatSvg from '@material-symbols/svg-400/rounded/chat.svg?raw';
import confirmationNumberSvg from '@material-symbols/svg-400/rounded/confirmation_number.svg?raw';
import darkModeSvg from '@material-symbols/svg-400/rounded/dark_mode.svg?raw';
import deleteSvg from '@material-symbols/svg-400/rounded/delete.svg?raw';
import documentScannerSvg from '@material-symbols/svg-400/rounded/document_scanner.svg?raw';
import gavelSvg from '@material-symbols/svg-400/rounded/gavel.svg?raw';
import gridViewSvg from '@material-symbols/svg-400/rounded/grid_view.svg?raw';
import homeSvg from '@material-symbols/svg-400/rounded/home.svg?raw';
import imageSvg from '@material-symbols/svg-400/rounded/image.svg?raw';
import infoSvg from '@material-symbols/svg-400/rounded/info.svg?raw';
import keyboardArrowDownSvg from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?raw';
import keySvg from '@material-symbols/svg-400/rounded/key.svg?raw';
import lightModeSvg from '@material-symbols/svg-400/rounded/light_mode.svg?raw';
import linkSvg from '@material-symbols/svg-400/rounded/link.svg?raw';
import listSvg from '@material-symbols/svg-400/rounded/list.svg?raw';
import lockSvg from '@material-symbols/svg-400/rounded/lock.svg?raw';
import menuBookSvg from '@material-symbols/svg-400/rounded/menu_book.svg?raw';
import refreshSvg from '@material-symbols/svg-400/rounded/refresh.svg?raw';
import restartAltSvg from '@material-symbols/svg-400/rounded/restart_alt.svg?raw';
import saveSvg from '@material-symbols/svg-400/rounded/save.svg?raw';
import searchSvg from '@material-symbols/svg-400/rounded/search.svg?raw';
import shoppingBagSvg from '@material-symbols/svg-400/rounded/shopping_bag.svg?raw';
import starFillSvg from '@material-symbols/svg-400/rounded/star-fill.svg?raw';
import starSvg from '@material-symbols/svg-400/rounded/star.svg?raw';
import storefrontSvg from '@material-symbols/svg-400/rounded/storefront.svg?raw';
import tollSvg from '@material-symbols/svg-400/rounded/toll.svg?raw';
import uploadSvg from '@material-symbols/svg-400/rounded/upload.svg?raw';

/**
 * 아이콘은 구글 Material Symbols(Rounded, 굵기 400) 한 벌만 쓴다. 둥근 모서리가 픽셀 곰 로고와 어울린다.
 *
 * 패키지의 SVG 파일에서 path 만 꺼내 React 로 다시 그린다. 쓰는 아이콘만 여기서 가져오므로
 * 번들에는 이 목록만 들어간다. 새 아이콘이 필요하면 이 파일에 한 줄 더한다.
 */

/** 파일마다 path 가 하나다. 없으면 빌드가 아니라 화면에서 빈칸으로 드러나므로 여기서 막는다. */
function pathOf(svg: string): string {
  const match = /<path d="([^"]+)"/.exec(svg);
  if (!match) throw new Error('Material Symbols SVG 에서 path 를 찾지 못했습니다.');
  return match[1];
}

type IconProps = ComponentProps<'span'>;

/**
 * antd 는 버튼, 메뉴, 업로드 영역 안의 아이콘을 `anticon` 클래스로 찾아 간격과 크기를 맞춘다.
 * 그 클래스를 그대로 달아 antd 아이콘 자리에 바로 들어가게 한다. Tooltip 이 감쌀 때 붙이는
 * 이벤트와 ref 도 span 으로 그대로 넘긴다.
 *
 * aria-label 을 주면 그 이름으로 읽히는 그림이 되고, 없으면 옆 글자를 꾸미는 것으로 보고 숨긴다.
 *
 * Material 글리프는 판(960) 안에 여백을 두고 그려져 antd 아이콘보다 작아 보인다. 1.2 배로 그리고
 * 바깥 여백을 그만큼 당겨, 줄 높이와 옆 글자 간격은 1em 짜리 아이콘과 같게 둔다.
 */
function createIcon(svg: string, name: string) {
  const d = pathOf(svg);
  function Icon({ className, ...rest }: IconProps) {
    const labelled = rest['aria-label'] !== undefined;
    return (
      <span
        role="img"
        aria-hidden={labelled ? undefined : true}
        {...rest}
        className={className ? `anticon ${className}` : 'anticon'}
      >
        <svg
          viewBox="0 -960 960 960"
          width="1.2em"
          height="1.2em"
          fill="currentColor"
          focusable="false"
          style={{ margin: '-0.1em' }}
        >
          <path d={d} />
        </svg>
      </span>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const AddIcon = createIcon(addSvg, 'AddIcon');
export const ArrowDownIcon = createIcon(keyboardArrowDownSvg, 'ArrowDownIcon');
export const AuctionIcon = createIcon(gavelSvg, 'AuctionIcon');
export const BagIcon = createIcon(shoppingBagSvg, 'BagIcon');
export const BookIcon = createIcon(menuBookSvg, 'BookIcon');
export const BugIcon = createIcon(bugReportSvg, 'BugIcon');
export const ChatIcon = createIcon(chatSvg, 'ChatIcon');
export const DarkModeIcon = createIcon(darkModeSvg, 'DarkModeIcon');
export const DeleteIcon = createIcon(deleteSvg, 'DeleteIcon');
export const GridIcon = createIcon(gridViewSvg, 'GridIcon');
export const HomeIcon = createIcon(homeSvg, 'HomeIcon');
export const ImageIcon = createIcon(imageSvg, 'ImageIcon');
export const InfoIcon = createIcon(infoSvg, 'InfoIcon');
export const KeyIcon = createIcon(keySvg, 'KeyIcon');
export const LightModeIcon = createIcon(lightModeSvg, 'LightModeIcon');
export const LinkIcon = createIcon(linkSvg, 'LinkIcon');
export const ListIcon = createIcon(listSvg, 'ListIcon');
export const LockIcon = createIcon(lockSvg, 'LockIcon');
export const ReadIcon = createIcon(documentScannerSvg, 'ReadIcon');
export const RefreshIcon = createIcon(refreshSvg, 'RefreshIcon');
export const ResetIcon = createIcon(restartAltSvg, 'ResetIcon');
export const SaveIcon = createIcon(saveSvg, 'SaveIcon');
export const SearchIcon = createIcon(searchSvg, 'SearchIcon');
export const ShopIcon = createIcon(storefrontSvg, 'ShopIcon');
export const StarFillIcon = createIcon(starFillSvg, 'StarFillIcon');
export const StarIcon = createIcon(starSvg, 'StarIcon');
export const TicketIcon = createIcon(confirmationNumberSvg, 'TicketIcon');
export const TollIcon = createIcon(tollSvg, 'TollIcon');
export const UploadIcon = createIcon(uploadSvg, 'UploadIcon');
