export const colours = {
  NonTalkTime: "hsl(190, 100%, 50%)",
  IVR: "hsl(354, 50%, 50%)",
  spk_0: "hsl(272, 100%, 50%)",
  spk_1: "hsl(45, 100%, 50%)",
  spk_2: "hsl(80, 100%, 31%)",
  spk_3: "hsl(27, 100%, 50%)",
  spk_4: "hsl(300, 75%, 50%)",
  spk_5: "hsl(152, 75%, 50%)",
  Interruptions: "hsla(152, 75%, 50%, 0.5)",
  negative: "rgb(255,0,0)",
  positive: "rgb(0,255,0)",
  neutral: "rgb(100,100,100)"
};

const Entities = {
  COMMERCIAL_ITEM: "hsla(216, 98%, 52%, 0.294)",
  DATE: "hsla(263, 78%, 58%, 0.294)",
  EVENT: "hsla(261, 51%, 51%, 0.294)",
  LOCATION: "hsla(354, 70%, 54%, 0.294)",
  ORGANIZATION: "hsla(27, 98%, 54%, 0.294)",
  OTHER: "hsla(45, 100%, 51%, 0.294)",
  PERSON: "hsla(152, 69%, 31%, 0.294)",
  QUANTITY: "hsla(162, 73%, 46%, 0.294)",
  TITLE: "hsla(190, 90%, 50%, 0.294)",
  DEFAULT: "hsla(300, 90%, 51%, 0.294)",
};

export const getEntityColor = (type) => {
  if (type in Entities) {
    return Entities[type];
  }

  return Entities.DEFAULT;
};
