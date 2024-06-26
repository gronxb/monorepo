import { UserRepository } from './user.repository';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom } from 'rxjs';
import { Profile } from 'passport-google-oauth20';
import { User } from 'src/prisma/dto';
import { Prisma } from '@prisma/client';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly httpService: HttpService,
    private readonly authService: AuthService,
  ) {}

  async getUser(userId: User['id']) {
    return this.userRepository.findUserById(userId);
  }

  async googleLogin(_accessToken: string) {
    const { data } = await firstValueFrom(
      this.httpService
        .get(
          `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${_accessToken}`,
        )
        .pipe(
          catchError(() => {
            throw 'An error happened!';
          }),
        ),
    );

    const userInfo = data as Profile['_json'];

    const checkGoogleUser = await this.userRepository.findGoogleUser({
      sub: userInfo.sub,
    });

    if (!checkGoogleUser) {
      // 구글 로그인
      const newUser = await this.userRepository.createUser({
        imageUrl: userInfo.profile,
        name: userInfo.name,
      });
      await this.userRepository.createGoogleUser({
        ...(userInfo as Omit<Prisma.GoogleProfileCreateInput, 'uid'>),
        uid: newUser.id,
      });

      const accessToken = await this.authService.jwtSignIn(newUser as User);
      return { accessToken };
    }

    const existUser = await this.userRepository.findUserById(
      checkGoogleUser.uid,
    );
    const accessToken = await this.authService.jwtSignIn(existUser as User);

    return { accessToken };
  }
}
