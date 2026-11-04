FROM maven:3.9-eclipse-temurin-17
WORKDIR /app
COPY pom.xml .
COPY src ./src
COPY public ./public
RUN mvn -q -B compile dependency:copy-dependencies -DoutputDirectory=target/dependency || true
RUN for j in target/dependency/*.jar; do unzip -l "$j" | grep -i "TikTokLive.class" && echo "^^ dans $j"; done; true
RUN mvn -q -B compile
CMD ["sh", "-c", "java -cp target/classes:target/dependency/* arene.Bridge"]
