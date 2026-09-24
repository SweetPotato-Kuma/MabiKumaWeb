import { Card, Flex, Typography } from 'antd';

const { Title, Paragraph, Text, Link } = Typography;

/** 방침이 바뀌면 이 날짜를 고친다. 방문자가 언제 기준인지 알 수 있어야 한다. */
const EFFECTIVE_DATE = '2026년 9월 24일';

/**
 * 개인정보처리방침.
 *
 * 애드센스는 쿠키를 쓰므로 그 사실을 고지하는 페이지가 있어야 심사를 통과한다.
 * 적힌 내용은 실제 동작과 맞아야 한다. 저장하는 값이나 워커가 받는 값이 바뀌면 여기도 고친다.
 */
export function PrivacyPage() {
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        개인정보처리방침
      </Title>

      <Card>
        <Typography style={{ maxWidth: 720 }}>
          <Paragraph type="secondary">시행일 {EFFECTIVE_DATE}</Paragraph>

          <Paragraph>
            MabiKuma(mabi.spkuma.com)는 개인이 만든 비공식 마비노기 도구입니다. 회원가입이 없고 이름, 이메일,
            연락처 같은 정보를 받지 않습니다. 아래는 사이트를 쓰는 동안 다뤄지는 정보입니다.
          </Paragraph>

          <Title level={5}>브라우저에 저장하는 정보</Title>
          <Paragraph>
            화면 밝기 설정처럼 이 사이트의 설정값을 브라우저 저장소(localStorage)에 남깁니다. 이 값은 운영자에게
            전송되지 않으며, 브라우저의 사이트 데이터를 지우면 함께 지워집니다.
          </Paragraph>

          <Title level={5}>조회 요청</Title>
          <Paragraph>
            시세와 상점 조회는 운영자가 Cloudflare Workers에 둔 조회 서버를 거쳐 넥슨 오픈 API로 전달됩니다. 짧은
            시간에 요청이 몰리는 것을 막기 위해 요청의 IP 주소를 요청 제한에 사용하며, Cloudflare가 서비스 운영
            로그를 일정 기간 보관할 수 있습니다. 운영자는 이 정보로 방문자를 식별하지 않습니다.
          </Paragraph>

          <Title level={5}>의견 보내기</Title>
          <Paragraph>
            의견 보내기로 보낸 제목과 내용, 보낸 화면의 주소는 이 사이트의 GitHub 저장소에 이슈로 등록되어 누구나 볼
            수 있습니다. 개인정보는 적지 마세요.
          </Paragraph>

          <Title level={5}>광고와 쿠키</Title>
          <Paragraph>
            이 사이트에는 Google AdSense 광고가 게재됩니다. Google을 비롯한 제3자 공급업체는 쿠키를 사용해 방문자가
            이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 게재합니다. Google은 광고 쿠키로 방문자에게 맞춤
            광고를 보여 줄 수 있습니다.
          </Paragraph>
          <Paragraph>
            맞춤 광고는{' '}
            <Link href="https://adssettings.google.com" target="_blank" rel="noreferrer">
              Google 광고 설정
            </Link>
            에서 끌 수 있습니다. 제3자 공급업체의 쿠키는{' '}
            <Link href="https://www.aboutads.info/choices" target="_blank" rel="noreferrer">
              aboutads.info
            </Link>
            에서 거부할 수 있습니다. Google이 정보를 어떻게 쓰는지는{' '}
            <Link href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">
              Google 파트너 사이트 정책
            </Link>
            에서 확인할 수 있습니다.
          </Paragraph>

          <Title level={5}>문의</Title>
          <Paragraph>
            문의와 요청은 화면 오른쪽 아래의 <Text strong>의견 보내기</Text>로 보내 주세요. 방침이 바뀌면 이 페이지의
            시행일을 고쳐 알립니다.
          </Paragraph>
        </Typography>
      </Card>
    </Flex>
  );
}
