import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Carousel, Flex, Grid, Typography, theme } from 'antd';
import type { CarouselRef } from 'antd/es/carousel';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { newsPostPath, useNewsBanners, type NewsBanner } from '@/features/news/api';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';

const { Text } = Typography;

/**
 * 배너 칸의 비율. 공식 그림은 1920x580 인데 그대로 두면 한 화면의 3분의 1 가까이를 차지해(1280px 폭에서 367px) 아래 새소식이
 * 밀려난다. 위아래를 약 10% 씩 잘라 1920x460(같은 폭에서 291px)으로 쓴다. 공식 배너는 제목과 그림이 가운데 모여 있어 잘려도
 * 읽힌다. 가장자리 가까이 적힌 작은 기간 글자만 일부 잘릴 수 있고, 그 정보는 글을 열면 있다. 그림이 늦게 떠도 칸이 밀리지
 * 않게 비율을 미리 잡는다.
 */
const ASPECT = '1920 / 460';

/** 공식 메인과 같다. 한 배너를 4초 보이고 0.5초에 걸쳐 넘긴다. */
const AUTOPLAY_MS = 4000;
const FADE_MS = 500;

const labelOf = (banner: NewsBanner) =>
  [banner.kind ? `[${banner.kind}]` : '', banner.title].filter(Boolean).join(' ') || '이벤트 배너';

/** 받아 둔 새소식 글이면 우리 기록으로, 아니면 공식 주소를 새 탭으로 연다. */
function BannerLink({ banner, children }: { banner: NewsBanner; children: ReactNode }) {
  const style = { display: 'block', height: '100%' } as const;
  if (banner.postId !== null)
    return (
      <Link to={newsPostPath(banner.postId)} style={style} aria-label={labelOf(banner)}>
        {children}
      </Link>
    );
  return (
    <a
      href={banner.link}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
      aria-label={labelOf(banner)}
    >
      {children}
    </a>
  );
}

/**
 * 첫 화면의 이벤트 배너. 공식 홈페이지 메인처럼 큰 그림을 페이드로 자동으로 넘기고, 좌우 화살표와 번호로 직접 넘길 수 있다.
 *
 *   - 열 장 안팎의 그림이 150KB~1.2MB 라 모두 받지 않는다. 지금 칸과 다음 칸만 받고, 넘어갈수록 다음 칸을 받는다.
 *   - 마우스를 올리거나 초점이 가면 멈춘다. 자동으로 넘어가는 것이라 멈춤 단추도 둔다(5초가 넘는 움직임의 접근성).
 *   - OS 의 움직임 줄이기가 켜져 있으면 자동으로 넘기지 않는다.
 *   - 제목은 그림 아래 띠에 적는다. 그림 위에 얹으면 그림의 글자와 겹친다.
 */
export function BannerCarousel({ persistent = false }: { persistent?: boolean }) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const reduced = usePrefersReducedMotion();
  const query = useNewsBanners();
  const ref = useRef<CarouselRef>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  // 받기로 한 칸. 처음에는 첫째와 둘째 칸이다.
  const [wanted, setWanted] = useState<ReadonlySet<number>>(() => new Set([0, 1]));

  if (query.error) {
    return <Alert type="error" showIcon message="이벤트 배너를 받지 못했습니다." />;
  }
  const banners = query.data?.banners ?? [];
  if (query.isLoading || query.data === undefined) {
    return (
      <div
        aria-busy="true"
        aria-label="이벤트 배너를 불러오는 중"
        style={{
          aspectRatio: ASPECT,
          borderRadius: token.borderRadiusLG,
          background: token.colorFillTertiary,
        }}
      />
    );
  }
  if (banners.length === 0)
    return persistent ? (
      <Card size="small" title="이벤트 배너">
        <Text type="secondary">표시할 이벤트 배너가 없습니다.</Text>
      </Card>
    ) : null;

  const count = banners.length;
  const active = banners[Math.min(current, count - 1)];
  const narrow = screens.sm === false;
  const autoplay = !paused && !reduced && count > 1;

  const onBeforeChange = (_from: number, to: number) => {
    setCurrent(to);
    setWanted((prev) => new Set([...prev, to, (to + 1) % count]));
  };

  return (
    <Card size="small" styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <section
        aria-roledescription="carousel"
        aria-label="이벤트 배너"
        style={{ position: 'relative' }}
      >
        <Carousel
          ref={ref}
          effect="fade"
          dots={false}
          arrows={false}
          infinite
          autoplay={autoplay}
          autoplaySpeed={AUTOPLAY_MS}
          speed={reduced ? 0 : FADE_MS}
          pauseOnHover
          pauseOnFocus
          beforeChange={onBeforeChange}
        >
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${count}`}
            >
              <div
                className="home-banner-image"
                style={{ aspectRatio: ASPECT, background: token.colorFillTertiary }}
              >
                {wanted.has(index) ? (
                  <BannerLink banner={banner}>
                    <img
                      src={banner.image}
                      alt={labelOf(banner)}
                      width={1920}
                      height={460}
                      draggable={false}
                      decoding="async"
                      // 첫 칸은 첫 화면의 가장 큰 그림이라 바로 받는다.
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </BannerLink>
                ) : null}
              </div>
            </div>
          ))}
        </Carousel>

        {count > 1 ? (
          <>
            <Button
              shape="circle"
              aria-label="이전 배너"
              icon={<ChevronLeftIcon />}
              onClick={() => ref.current?.prev()}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
              }}
            />
            <Button
              shape="circle"
              aria-label="다음 배너"
              icon={<ChevronRightIcon />}
              onClick={() => ref.current?.next()}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
              }}
            />
          </>
        ) : null}
      </section>

      <Flex
        align="center"
        justify="space-between"
        gap={12}
        style={{ padding: '8px 12px', borderTop: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Text ellipsis style={{ minWidth: 0, flex: 1 }} aria-live="off">
          {labelOf(active)}
        </Text>
        {count > 1 ? (
          <Flex align="center" gap={narrow ? 4 : 2} style={{ flex: 'none' }}>
            {narrow ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                {current + 1} / {count}
              </Text>
            ) : (
              banners.map((banner, index) => (
                <Button
                  key={banner.id}
                  size="small"
                  type={index === current ? 'primary' : 'text'}
                  className="tnum home-banner-page"
                  aria-label={`${index + 1}번 배너`}
                  aria-current={index === current ? 'true' : undefined}
                  onClick={() => ref.current?.goTo(index)}
                  style={{ minWidth: 28, paddingInline: 4 }}
                >
                  {index + 1}
                </Button>
              ))
            )}
            <Button
              size="small"
              type="text"
              aria-label={paused ? '배너 자동 넘김 재생' : '배너 자동 넘김 멈춤'}
              aria-pressed={paused}
              icon={paused ? <PlayIcon /> : <PauseIcon />}
              onClick={() => setPaused((prev) => !prev)}
              disabled={reduced}
            />
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}
