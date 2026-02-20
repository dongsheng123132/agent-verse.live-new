import { Composition } from "remotion";
import { AgentVersePromo } from "./AgentVersePromo";
import { TerminalPromo } from "./TerminalPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AgentVersePromo"
        component={AgentVersePromo}
        durationInFrames={450} // 15 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TerminalPromo"
        component={TerminalPromo}
        durationInFrames={500} // ~16.7 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
