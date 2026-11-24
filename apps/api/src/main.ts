import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { resolveTrustedProxies } from "./auth/trusted-proxy";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: resolveTrustedProxies(process.env.TRUST_PROXY),
      bodyLimit: 2 * 1024 * 1024,
      logger: process.env.NODE_ENV !== "test",
    }),
  );

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(",").map((value) => value.trim()) ?? false,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
