const { Renderer, Camera, Transform, Plane, Mesh, Program, Texture } = OGL;

const lerp = (p1, p2, t) => p1 + (p2 - p1) * t;

class Title {
    constructor({ gl, text, font, color }) {
        this.gl = gl;
        this.text = text;
        this.font = font;
        this.color = color;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.texture = new Texture(gl, { generateMipmaps: false });
        this.createTexture();
    }

    createTexture() {
        const padding = 20;
        this.ctx.font = this.font;
        const metrics = this.ctx.measureText(this.text);
        const width = Math.ceil(metrics.width) + padding * 2;
        const height = 100;

        this.canvas.width = width;
        this.canvas.height = height;

        this.ctx.font = this.font;
        this.ctx.fillStyle = this.color;
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillText(this.text, width / 2, height / 2);

        this.texture.image = this.canvas;
        this.width = width;
        this.height = height;
    }
}

class Media {
    constructor({ geometry, gl, image, text, index, length, scene, screen, viewport, bend, borderRadius, textColor, font }) {
        this.extra = 0;
        this.geometry = geometry;
        this.gl = gl;
        this.image = image;
        this.text = text;
        this.index = index;
        this.length = length;
        this.scene = scene;
        this.screen = screen;
        this.viewport = viewport;
        this.bend = bend;
        this.borderRadius = borderRadius;

        this.texture = new Texture(gl, { generateMipmaps: true });
        this.createShader();
        this.createMesh();

        if (this.text) {
            this.title = new Title({
                gl,
                text: this.text,
                font: font,
                color: textColor
            });
            this.createTitleMesh();
        }

        this.onResize();
    }

    createShader() {
        this.program = new Program(this.gl, {
            vertex: `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                uniform mat4 modelViewMatrix;
                uniform mat4 projectionMatrix;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragment: `
                precision highp float;
                uniform vec2 uImageSizes;
                uniform vec2 uPlaneSizes;
                uniform sampler2D tMap;
                uniform float uBorderRadius;
                varying vec2 vUv;

                float roundedBoxSDF(vec2 p, vec2 b, float r) {
                    vec2 d = abs(p) - b;
                    return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
                }

                void main() {
                    if (uImageSizes.x == 0.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.2);
                        return;
                    }

                    vec2 ratio = vec2(
                        min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
                        min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
                    );

                    vec2 uv = vec2(
                        vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
                        vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
                    );

                    vec4 color = texture2D(tMap, uv);

                    float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
                    float alpha = 1.0 - smoothstep(-0.01, 0.01, d);

                    gl_FragColor = vec4(color.rgb, alpha);
                    if (alpha < 0.01) discard;
                }
            `,
            uniforms: {
                tMap: { value: this.texture },
                uPlaneSizes: { value: [0, 0] },
                uImageSizes: { value: [0, 0] },
                uBorderRadius: { value: this.borderRadius }
            },
            transparent: true
        });

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = this.image;
        img.onload = () => {
            this.texture.image = img;
            this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
        };
    }

    createMesh() {
        this.plane = new Mesh(this.gl, {
            geometry: this.geometry,
            program: this.program
        });
        this.plane.setParent(this.scene);
    }

    createTitleMesh() {
        this.titleProgram = new Program(this.gl, {
            vertex: `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                uniform mat4 modelViewMatrix;
                uniform mat4 projectionMatrix;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragment: `
                precision highp float;
                uniform sampler2D tMap;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(tMap, vUv);
                }
            `,
            uniforms: {
                tMap: { value: this.title.texture }
            },
            transparent: true
        });

        this.titleMesh = new Mesh(this.gl, {
            geometry: new Plane(this.gl),
            program: this.titleProgram
        });

        this.titleMesh.setParent(this.scene);
    }

    update(scroll, direction) {
        this.plane.position.x = this.x - scroll.current - this.extra;
        const x = this.plane.position.x;
        const H = this.viewport.width / 2;

        if (this.bend !== 0) {
            const B_abs = Math.abs(this.bend);
            const R = (H * H + B_abs * B_abs) / (2 * B_abs);
            const arc = R - Math.sqrt(Math.max(0, R * R - Math.min(Math.abs(x), H) ** 2));
            this.plane.position.y = (this.bend > 0 ? -1 : 1) * arc;
            this.plane.rotation.z = (this.bend > 0 ? -1 : 1) * Math.sign(x) * Math.asin(Math.min(Math.abs(x), H) / R);
        }

        if (this.titleMesh) {
            this.titleMesh.position.x = this.plane.position.x;
            this.titleMesh.position.y = this.plane.position.y - this.plane.scale.y / 2 - 0.5;
            this.titleMesh.rotation.z = this.plane.rotation.z;
        }

        if (direction === 'right' && this.plane.position.x + this.plane.scale.x / 2 < -H * 2) {
            this.extra -= this.widthTotal;
        }

        if (direction === 'left' && this.plane.position.x - this.plane.scale.x / 2 > H * 2) {
            this.extra += this.widthTotal;
        }
    }

    onResize({ screen, viewport } = {}) {
        if (screen) this.screen = screen;
        if (viewport) this.viewport = viewport;

        const s = this.screen.height / 1200;
        this.plane.scale.y = (this.viewport.height * (800 * s)) / this.screen.height;
        this.plane.scale.x = (this.viewport.width * (600 * s)) / this.screen.width;

        this.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];

        if (this.titleMesh) {
            const titleScale = 0.5;
            this.titleMesh.scale.x = (this.title.width / this.screen.width) * this.viewport.width * titleScale;
            this.titleMesh.scale.y = (this.title.height / this.screen.height) * this.viewport.height * titleScale;
        }

        this.width = this.plane.scale.x + 1.5;
        this.widthTotal = this.width * this.length;
        this.x = this.width * this.index;
    }
}

class CircularGallery {
    constructor(container, options) {
        this.container = container;
        this.options = options;

        this.scroll = {
            ease: options.scrollEase || 0.05,
            current: 0,
            target: 0,
            last: 0,
            speed: options.scrollSpeed || 2
        };

        this.onResize = this.onResize.bind(this);
        this.update = this.update.bind(this);

        this.renderer = new Renderer({
            alpha: true,
            antialias: true,
            dpr: Math.min(window.devicePixelRatio, 2)
        });

        this.gl = this.renderer.gl;
        this.container.appendChild(this.gl.canvas);

        this.camera = new Camera(this.gl);
        this.camera.position.z = 20;

        this.scene = new Transform();

        this.onResize();

        this.planeGeo = new Plane(this.gl, {
            heightSegments: 1,
            widthSegments: 1
        });

        const galleryItems = options.items.concat(options.items);

        this.medias = galleryItems.map((d, i) => new Media({
            geometry: this.planeGeo,
            gl: this.gl,
            image: d.image,
            text: d.text,
            index: i,
            length: galleryItems.length,
            scene: this.scene,
            screen: this.screen,
            viewport: this.viewport,
            bend: options.bend,
            borderRadius: options.borderRadius,
            textColor: options.textColor || '#ffffff',
            font: options.font || 'bold 30px Outfit'
        }));

        this.addEvents();
        this.update();
    }

    onResize() {
        if (!this.container) return;

        this.screen = {
            width: this.container.clientWidth,
            height: this.container.clientHeight
        };

        this.renderer.setSize(this.screen.width, this.screen.height);
        this.camera.perspective({
            aspect: this.screen.width / this.screen.height
        });

        const h = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
        this.viewport = {
            width: h * this.camera.aspect,
            height: h
        };

        if (this.medias) {
            this.medias.forEach(m => m.onResize({
                screen: this.screen,
                viewport: this.viewport
            }));
        }
    }

    addEvents() {
        window.addEventListener('resize', this.onResize);

        window.addEventListener('wheel', (e) => {
            this.scroll.target += Math.sign(e.deltaY) * this.scroll.speed;
        });

        this.gl.canvas.addEventListener('mousedown', (e) => {
            this.isDown = true;
            this.scroll.pos = this.scroll.target;
            this.start = e.clientX;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDown) {
                this.scroll.target = this.scroll.pos + (this.start - e.clientX) * 0.04 * this.scroll.speed;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDown = false;
        });

        this.gl.canvas.addEventListener('touchstart', (e) => {
            this.isDown = true;
            this.scroll.pos = this.scroll.target;
            this.start = e.touches[0].clientX;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (this.isDown) {
                this.scroll.target = this.scroll.pos + (this.start - e.touches[0].clientX) * 0.04 * this.scroll.speed;
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            this.isDown = false;
        });
    }

    update() {
        this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
        const dir = this.scroll.current > this.scroll.last ? 'right' : 'left';

        if (this.medias) {
            this.medias.forEach(m => m.update(this.scroll, dir));
        }

        this.renderer.render({
            scene: this.scene,
            camera: this.camera
        });

        this.scroll.last = this.scroll.current;
        this.frame = window.requestAnimationFrame(this.update);
    }

    destroy() {
        window.cancelAnimationFrame(this.frame);
        window.removeEventListener('resize', this.onResize);
    }
}

window.CircularGallery = CircularGallery;