const TrendUpSVG = ({ style }) => (
  <img src="/trending_up.svg" alt="Up" style={style} />
);

const TrendDownSVG = ({ style }) => (
  <img src="/trending_down.svg" alt="Down" style={style} />
);

const TrendFlatSVG = ({ style }) => (
  <img src="/trending_flat.svg" alt="Flat" style={style} />
);

export const TrendIcon = ({ trend, style }) => {
  if (trend >= 0.4) {
    return <TrendUpSVG style={style} />;
  }

  if (trend <= -0.4) {
    return <TrendDownSVG style={style} />;
  }
  return <TrendFlatSVG style={style} />;
};