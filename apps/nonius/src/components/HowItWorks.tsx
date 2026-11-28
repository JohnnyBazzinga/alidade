// How it works (design §9; Req 4.7, 9.2, 12.2): what the app measures, what it corrects for, where
// its numbers come from, what is stored, and its limits.

import { LOOK } from './look';

const SECTIONS: readonly { readonly title: string; readonly paragraphs: readonly string[] }[] = [
  {
    title: 'What it does',
    paragraphs: [
      'At a moment the Sun stands directly overhead at one point of the Earth. Everyone who sees it at the same height above the horizon at that moment stands on one circle around that point. The phone measures the Sun\u2019s height against gravity; two or more circles cross where you are. Every position is drawn with its 95 % area, because a degree of altitude is about 111 km (60 nautical miles) on the ground.',
    ],
  },
  {
    title: 'What it corrects, and what it does not',
    paragraphs: [
      'It corrects for the refraction of the air by Bennett\u2019s formula (G. G. Bennett, 1982, as given in Meeus, Astronomical Algorithms, chapter 16), good to about 0.07\u2032 in standard conditions, and adds a tenth of it to the uncertainty. It applies no dip, because the horizontal comes from gravity and not from the sea. It applies no semi-diameter, because the crosshair is on the centre of the Sun. It applies no parallax, which is under 0.15\u2032. So: no dip, no semi-diameter, no parallax.',
      'The index error is the phone\u2019s constant error in altitude, as on a sextant. Measure it at a place the phone knows, and every position uses it. Without it, the phone\u2019s altitude may be off by about 3.5°, which is about 390 km on the ground.',
    ],
  },
  {
    title: 'Where the numbers come from',
    paragraphs: [
      'The Sun\u2019s position comes from the astronomy-engine library, checked against the values printed in Meeus and by the U.S. Naval Observatory. The phone\u2019s clock gives the time, so each minute of error in it moves the position by up to 28 km east or west. No GPS is used for the position. The GPS is asked only when you tap the comparison, or to measure the index error, and is never used for a position.',
    ],
  },
  {
    title: 'What is stored',
    paragraphs: [
      'Only your sights and the index error are stored on this phone: for each sight its time, the altitude, its uncertainty and the direction of the compass if there was one. No position is stored, and none is sent anywhere. The sights and their times are enough for anyone to work out where they were taken, so delete them when you no longer need them.',
    ],
  },
  {
    title: 'Its limits',
    paragraphs: [
      'The 95 % area holds only if every sight was of the Sun\u2019s centre, you did not move, the phone\u2019s clock was right and the errors are as stated. Nonius is a backup and a teaching instrument, not navigation equipment.',
    ],
  },
];

export function HowItWorks({ onBack }: { readonly onBack: () => void }) {
  return (
    <section data-testid="how-it-works" style={LOOK.stack}>
      <div style={LOOK.controls}>
        <button type="button" onClick={onBack} style={LOOK.button}>
          Back
        </button>
      </div>
      <h1 style={LOOK.title}>How it works</h1>
      {SECTIONS.map((s) => (
        <section key={s.title} style={LOOK.panel}>
          <h2 style={LOOK.heading}>{s.title}</h2>
          {s.paragraphs.map((p) => (
            <p key={p.slice(0, 24)} style={LOOK.text}>
              {p}
            </p>
          ))}
        </section>
      ))}
    </section>
  );
}
