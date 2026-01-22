import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(
  _req: Request,
  { params }: { params: { round: string } }
) {
  const round = params.round;

  const targetUrl =
    'https://www.dhlottery.co.kr/wnprchsplcsrch/home.do?method=searchWinPlace&drwNo=' +
    round;

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://www.dhlottery.co.kr/',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch lotto page' },
      { status: 500 }
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const data: any[] = [];

  $('table.tbl_data tbody tr').each((_, el) => {
    const tds = $(el).find('td');
    if (tds.length < 6) return;

    const shopIdRaw = $(tds[5]).text().trim();

    data.push({
      round: Number(round),
      no: Number($(tds[0]).text().trim()),
      rank: Number($(tds[1]).text().replace('등', '').trim()),
      shopName: $(tds[2]).text().trim(),
      method: $(tds[3]).text().trim(),
      address: $(tds[4]).text().trim(),
      shopId: shopIdRaw === '-' ? null : shopIdRaw,
    });
  });

  return NextResponse.json({
    round: Number(round),
    count: data.length,
    data,
  });
}
