import { Howl } from 'howler';

const sounds = {
    join: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/join.mp3`]
    }),
    left: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/left.mp3`]
    }),
    error: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/error.mp3`]
    }),
    step: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/step.mp3`]
    }),
    stage: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/stage.mp3`]
    }),
    result: new Howl({
        src: [`${process.env.PUBLIC_URL}/sounds/result.mp3`]
    })
};

export default sounds;