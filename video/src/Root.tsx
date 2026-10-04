import { Composition } from "remotion";
import { Promo, PROMO_DURATION } from "./Promo";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CourseKeeperPromo"
      component={Promo}
      durationInFrames={PROMO_DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
