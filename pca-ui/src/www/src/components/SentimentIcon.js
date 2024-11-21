const SmileSVG = ({ style }) => (
  <img src="/smile.svg" alt="Smile" style={{ ...style, width: '28px', height: '28px' }} />
);

const BadSVG = ({ style }) => (
  <img src="/bad.svg" alt="Bad" style={{ ...style, width: '28px', height: '28px' }} />
);

const NeutralSVG = ({ style }) => (
  <img src="/neutral.svg" alt="Neutral" style={{ ...style, width: '28px', height: '28px' }} />
);

export const SentimentIcon = ({ score, style }) => {
  if (score > 0) {
    return <SmileSVG style={style} />;
  }

  if (score < 0) {
    return <BadSVG style={style} />;
  }

  return <NeutralSVG style={style} />;
};